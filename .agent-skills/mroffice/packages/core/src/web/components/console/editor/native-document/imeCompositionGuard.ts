"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/**
 * Safari/macOS Chinese IME safety boundary.
 *
 * A composition is a browser-owned, temporary DOM island.  Any ProseMirror
 * transaction that redraws an ancestor while that island is live can make
 * WebKit commit the visible pinyin first and then insert the selected CJK
 * candidate as a second edit (for example `ni hao` followed by `你好`).
 *
 * ProseMirror protects its own keymaps with `view.composing`, but MRNote also
 * has asynchronous pagination/decorations and application-level shortcuts.
 * This module gives all of those systems one composition truth and one
 * post-composition resume hook.
 */

export const IME_COMPOSITION_SETTLED_META = "mrnoteImeCompositionSettled";
/**
 * On the settled wake-up of a composition that changed the document: the
 * work deferred to the wake-up (a formula result, a heading's anchor, a cell
 * width) belongs to that typed edit, as it would have belonged to an
 * ordinary keystroke's batch. The shared room publishes the batch as part of
 * the user's step (`isImeDeferredUserEdit`); without it the deferred writes
 * stayed view-only, the editor no longer matched the room, and every save was
 * refused until the next keystroke.
 */
export const IME_DEFERRED_USER_EDIT_META = "mrnoteImeDeferredUserEdit";

/** Whether this batch is the settled wake-up of a composition that typed. */
export function isImeDeferredUserEdit(transactions: readonly Transaction[]): boolean {
  return transactions.some(
    (transaction) => transaction.getMeta(IME_DEFERRED_USER_EDIT_META) === true,
  );
}
/** Defer serialization of an initial text context; NOT an IME write permit. */
export const IME_COMPOSITION_PREPARE_META = "mrnoteImeCompositionPrepare";

/**
 * prosemirror-view intentionally keeps its composition DOM descriptors alive
 * for 20ms after `compositionend` (`scheduleComposeEnd(view, 20)`). Releasing
 * MRNote's pagination/decorations in the next macrotask races that cleanup on
 * Safari: an ancestor redraw can make the visible pinyin permanent just before
 * WebKit's committed Hanzi is read. Keep one additional frame of headroom past
 * ProseMirror's own timer. A later `insertFromComposition` restarts this grace
 * period, covering both event orders used by Safari releases in the wild.
 */
export const IME_COMPOSITION_POST_END_GRACE_MS = 40;

interface ImeCompositionGuardState {
  safariSentinelPos: number | null;
  /** The composition in progress (or just ended) changed the document. */
  userEditDeferred: boolean;
}

const imeCompositionKey = new PluginKey<ImeCompositionGuardState>(
  "mrnoteImeCompositionGuard",
);

const SAFARI_IME_SENTINEL_ATTR = "data-mrai-safari-ime-sentinel";

function isSafariBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent;
  return (
    /Safari/i.test(userAgent) &&
    !/(?:Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Android)/i.test(userAgent)
  );
}

/**
 * Return the content start of the selected empty text block when it is nested
 * in a structural page.
 *
 * Safari has a long-standing contenteditable defect in empty nested
 * containers: the Latin pre-edit text can remain after the CJK candidate is
 * committed. ProseMirror Tables documents the same failure for empty cells and
 * avoids it with a view-only zero-width widget (MIT, upstream commit
 * 7d18c9c4770d426ce3130dff864ce4bf53ee37db). MRAI keeps the workaround scoped
 * to the exact equivalent boundary: an empty selected text block inside a
 * pageBlock. The widget never enters the ProseMirror document or persistence.
 */
function selectedEmptyPageBlockTextStart(state: EditorState): number | null {
  const { $head } = state.selection;
  if (!$head.parent.isTextblock || $head.parent.content.size !== 0) return null;

  for (let depth = $head.depth - 1; depth > 0; depth -= 1) {
    if ($head.node(depth).type.name === "pageBlock") return $head.start();
  }
  return null;
}

function createSafariImeSentinel(): HTMLElement {
  const sentinel = document.createElement("span");
  sentinel.setAttribute(SAFARI_IME_SENTINEL_ATTR, "");
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.cssText =
    "display:inline-block;width:0;height:0;line-height:0;overflow:hidden;";
  sentinel.textContent = "\u200B";
  return sentinel;
}

type SettledListener = () => void;

interface CompositionRuntime {
  active: boolean;
  generation: number;
  releaseTimer: number | null;
  finalInputGeneration: number | null;
  finalInputTimer: number | null;
  listeners: Set<SettledListener>;
}

const runtimes = new WeakMap<EditorView, CompositionRuntime>();

/**
 * Views with a live composition, as a module-level set.
 *
 * `appendTransaction` receives `(transactions, oldState, newState)` and no
 * view, so the only composition signal available inside it used to be
 * `transaction.getMeta("composition")` — which is set ONLY on the transactions
 * prosemirror-view generates while reading the composition DOM.
 *
 * That is the narrower half of the hazard. A transaction from anywhere ELSE
 * that lands mid-composition — a timer, a React-driven command, a TipTap input
 * rule replaying on `compositionend` — carries no such meta, so every plugin
 * ran, wrote to the document, redrew the pageBlock ancestor, and committed the
 * visible pinyin as text. The guard was passing exactly the traffic that hurts.
 *
 * A composing view anywhere means defer: a person types into one editor at a
 * time, and everything routed through `imeSafeAppendTransaction` is by contract
 * idempotent re-derivation that the settle wake-up re-runs. Deferring too much
 * costs one extra pass; deferring too little corrupts what the reader typed.
 */
const composingViews = new Set<EditorView>();

/** True while any editor on the page owns a live IME composition. */
export function isAnyImeCompositionActive(): boolean {
  for (const view of composingViews) {
    if (view.isDestroyed) {
      composingViews.delete(view);
      continue;
    }
    if (view.composing || runtimes.get(view)?.active === true) return true;
    composingViews.delete(view);
  }
  return false;
}

export interface ImeDeferredCommitQueue {
  /** Replace the interim work; only the most recent composition state matters. */
  defer(commit: () => void): void;
  /** Run the latest deferred commit once, after composition has settled. */
  settle(): boolean;
  /** Discard unsafe/pre-hydration work without running it. */
  clear(): void;
  hasPending(): boolean;
}

/**
 * Tiny framework-independent queue used by NoteEditor autosave. Keeping this
 * pure makes the critical guarantee testable: arbitrary pre-edit snapshots may
 * arrive, but persistence runs once and reads only the live final document.
 */
export function createImeDeferredCommitQueue(): ImeDeferredCommitQueue {
  let pending: (() => void) | null = null;
  return {
    defer(commit) {
      pending = commit;
    },
    settle() {
      const run = pending;
      pending = null;
      if (!run) return false;
      run();
      return true;
    },
    clear() {
      pending = null;
    },
    hasPending() {
      return pending !== null;
    },
  };
}

function runtimeFor(view: EditorView): CompositionRuntime {
  let runtime = runtimes.get(view);
  if (!runtime) {
    runtime = {
      active: false,
      generation: 0,
      releaseTimer: null,
      finalInputGeneration: null,
      finalInputTimer: null,
      listeners: new Set(),
    };
    runtimes.set(view, runtime);
  }
  return runtime;
}

function nativeEventIsComposing(event?: Event | null): boolean {
  if (!event) return false;
  const candidate = event as Event & {
    isComposing?: boolean;
    keyCode?: number;
    inputType?: string;
  };
  return (
    candidate.isComposing === true ||
    candidate.keyCode === 229 ||
    candidate.inputType === "insertCompositionText" ||
    candidate.inputType === "deleteCompositionText" ||
    candidate.inputType === "insertFromComposition"
  );
}

/** True for both ProseMirror's native flag and MRNote's Safari-safe envelope. */
export function isImeCompositionActive(
  view: EditorView,
  event?: Event | null,
): boolean {
  return (
    view.composing === true ||
    runtimes.get(view)?.active === true ||
    nativeEventIsComposing(event)
  );
}

/**
 * Subscribe derived systems (pagination, autosave) to the first safe task after
 * the browser has committed the composition DOM into ProseMirror state.
 */
export function onImeCompositionSettled(
  view: EditorView,
  listener: SettledListener,
): () => void {
  const runtime = runtimeFor(view);
  runtime.listeners.add(listener);
  return () => runtime.listeners.delete(listener);
}

/** Native IME reads, or the text context prepared immediately before it starts.
 * Both defer serialization/derivation; only native composition metadata is
 * accepted by the transaction guard while a composition is already active. */
export function hasImeCompositionTransaction(
  transactions: readonly Transaction[],
): boolean {
  return transactions.some((transaction) =>
    Boolean(transaction.getMeta("composition")) ||
    transaction.getMeta(IME_COMPOSITION_PREPARE_META) === true,
  );
}

function clearFinalCompositionInput(runtime: CompositionRuntime): void {
  runtime.finalInputGeneration = null;
  if (runtime.finalInputTimer !== null) {
    window.clearTimeout(runtime.finalInputTimer);
    runtime.finalInputTimer = null;
  }
}

function beginComposition(view: EditorView): void {
  const runtime = runtimeFor(view);
  clearFinalCompositionInput(runtime);
  runtime.generation += 1;
  runtime.active = true;
  composingViews.add(view);
  if (runtime.releaseTimer !== null) {
    window.clearTimeout(runtime.releaseTimer);
    runtime.releaseTimer = null;
  }
}

/**
 * Give WebKit's final candidate DOM read one narrowly-scoped transaction.
 *
 * With a non-default font at a collapsed caret, ProseMirror owns stored marks.
 * Safari can emit the final `insertFromComposition` after `compositionend`, at
 * which point prosemirror-view has no composition id to attach to its DOM
 * transaction. Treating that one native read as an arbitrary local command
 * made the selected Hanzi disappear. The token is capture-phase, generation
 * bound, single-use, and expires in the next task; toolbar/AI/timer writes stay
 * blocked throughout the rest of the composition envelope.
 */
function markFinalCompositionInput(view: EditorView): void {
  const runtime = runtimeFor(view);
  clearFinalCompositionInput(runtime);
  const generation = runtime.generation;
  runtime.finalInputGeneration = generation;
  runtime.finalInputTimer = window.setTimeout(() => {
    runtime.finalInputTimer = null;
    if (runtime.finalInputGeneration === generation) {
      runtime.finalInputGeneration = null;
    }
  }, 0);
}

function consumeFinalCompositionInput(view: EditorView | null): boolean {
  if (view === null || view.isDestroyed) return false;
  const runtime = runtimes.get(view);
  if (
    runtime?.active !== true ||
    runtime.finalInputGeneration !== runtime.generation
  ) {
    return false;
  }
  clearFinalCompositionInput(runtime);
  return true;
}

function scheduleCompositionRelease(
  view: EditorView,
  runtime: CompositionRuntime,
  generation: number,
): void {
  // WebKit emits the final beforeinput/input around compositionend, but
  // prosemirror-view deliberately waits 20ms before endComposition() performs
  // its final forceFlush + composition-node cleanup. A zero-delay release is
  // therefore still inside the browser-owned DOM interval on Safari.
  runtime.releaseTimer = window.setTimeout(() => {
    runtime.releaseTimer = null;
    if (runtime.generation !== generation) return;
    if (view.isDestroyed) return;

    // `insertFromComposition` is not proof that WebKit has emitted the paired
    // `compositionend` yet. On a busy Safari tab those events can land in
    // different tasks more than one grace interval apart. Never dispatch the
    // settled wake-up while ProseMirror still owns a composition descriptor:
    // that transaction can redraw the pageBlock ancestor and preserve the
    // visible pinyin before the Hanzi commit. Keep the same generation latched
    // and retry; the real compositionend flips view.composing to false.
    if (view.composing) {
      scheduleCompositionRelease(view, runtime, generation);
      return;
    }

    releaseComposition(view, runtime);
  }, IME_COMPOSITION_POST_END_GRACE_MS);
}

function releaseComposition(view: EditorView, runtime: CompositionRuntime): void {
  if (runtime.releaseTimer !== null) {
    window.clearTimeout(runtime.releaseTimer);
    runtime.releaseTimer = null;
  }
  runtime.active = false;
  composingViews.delete(view);

  // A meta-only transaction wakes append-transaction/transaction listeners
  // without changing content, selection, history, or the composing DOM.
  const tr = view.state.tr
    .setMeta(IME_COMPOSITION_SETTLED_META, true)
    .setMeta("addToHistory", false);
  if (imeCompositionKey.getState(view.state)?.userEditDeferred === true) {
    tr.setMeta(IME_DEFERRED_USER_EDIT_META, true);
  }
  view.dispatch(tr);
  for (const listener of [...runtime.listeners]) listener();
}

function settleComposition(view: EditorView): void {
  const runtime = runtimeFor(view);
  const generation = runtime.generation;
  if (runtime.releaseTimer !== null) {
    window.clearTimeout(runtime.releaseTimer);
  }
  scheduleCompositionRelease(view, runtime, generation);
}

/**
 * Wrap an ``appendTransaction`` so it cannot run while a CJK IME is composing.
 *
 * Four of the document's plugins already opened with
 * ``if (hasImeCompositionTransaction(transactions)) return null;`` — and that
 * is the whole protection. It is ADVISORY: a plugin only skips if its author
 * knew to ask. Adding a plugin therefore means adding a chance to break Safari
 * composition, and the DOM damage is not subtle — a pagination or mark
 * transaction redraws the pageBlock ancestor, WebKit commits the visible pinyin
 * as text, and the CJK candidate lands after it as a second edit.
 *
 * Going through this wrapper makes the check structural instead of remembered.
 * ``native-document-ime-guard.test.ts`` fails on any ``appendTransaction``
 * defined without it, so the next plugin is guarded whether or not its author
 * has ever heard of an input method.
 *
 * ONLY for work that is idempotent — a rescan that re-derives its result from
 * the settled document (block ids, heading anchors, caption numbering, table
 * formulas). Step-driven work that must observe each transaction's steps (an
 * audit trail such as tracked changes) cannot simply skip: the settle wake-up
 * carries no steps, so the record would be lost rather than deferred. Such a
 * plugin needs to accumulate and replay, and must not use this.
 */
export type ImeSafeAppendTransaction = (
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
) => Transaction | null | undefined;

export function imeSafeAppendTransaction(
  append: ImeSafeAppendTransaction,
): ImeSafeAppendTransaction {
  return (transactions, oldState, newState) => {
    // Two questions, because they catch different traffic: the meta identifies
    // ProseMirror's own composition reads, and the view set catches every OTHER
    // transaction that happens to land while the IME still owns the DOM.
    if (hasImeCompositionTransaction(transactions)) return null;
    if (isAnyImeCompositionActive()) return null;
    return append(transactions, oldState, newState);
  };
}

interface HeldImeBatches {
  readonly oldState: EditorState;
  readonly transactions: readonly Transaction[];
}

/**
 * Wrap an ``appendTransaction`` that reads WHAT CHANGED -- the batch's steps,
 * its mapping, the old document against the new (a deleted copy of a sliced
 * list, a split section, a ticked checkbox, a paragraph's new format) -- so
 * it cannot write while a CJK IME is composing and still sees every change
 * made meanwhile.
 *
 * Skipping, as ``imeSafeAppendTransaction`` does, would lose such a change:
 * the settled wake-up carries no steps, and its old and new documents are the
 * same. Here the batches that arrive during the composition are held with the
 * state before the first of them, and the first batch after it (the wake-up)
 * hands the plugin all of them at once: the old document from before the
 * composition, every transaction since, the settled new document -- one
 * ordinary batch, as if the composition had been one keystroke.
 *
 * The hold is keyed by the document it ends on, so it is replayed only into
 * the batch that continues it: a state put in place without a transaction (a
 * new document loaded into the view), or a plugin instance several editors
 * share, never receives another chain's transactions.
 */
export function imeReplayingAppendTransaction(
  append: ImeSafeAppendTransaction,
): ImeSafeAppendTransaction {
  const held = new WeakMap<ProseMirrorNode, HeldImeBatches>();
  return (transactions, oldState, newState) => {
    const earlier = held.get(oldState.doc);
    if (earlier) held.delete(oldState.doc);
    const batch = earlier ? [...earlier.transactions, ...transactions] : transactions;
    const from = earlier ? earlier.oldState : oldState;
    if (hasImeCompositionTransaction(transactions) || isAnyImeCompositionActive()) {
      held.set(newState.doc, { oldState: from, transactions: batch });
      return null;
    }
    return append(batch, from, newState);
  };
}

export const ImeCompositionGuard = Extension.create({
  name: "imeCompositionGuard",
  // Install before editor feature keymaps/plugins.  The capture listener below
  // is the hard boundary; high priority also makes the extension's lifecycle
  // deterministic in tests and future registry refactors.
  priority: 10_000,

  addProseMirrorPlugins() {
    let mountedView: EditorView | null = null;
    return [
      new Plugin<ImeCompositionGuardState>({
        key: imeCompositionKey,
        state: {
          init(_config, state) {
            return {
              safariSentinelPos: isSafariBrowser()
                ? selectedEmptyPageBlockTextStart(state)
                : null,
              userEditDeferred: false,
            };
          },
          apply(transaction, previous, _oldState, newState) {
            // A typed composition: its own reads (or the final input the
            // guard admits) change the document while the envelope is open.
            // The settled wake-up reads this and starts the next one clean.
            const userEditDeferred =
              transaction.getMeta(IME_COMPOSITION_SETTLED_META) === true
                ? false
                : previous.userEditDeferred ||
                  (transaction.docChanged &&
                    transaction.getMeta("addToHistory") !== false &&
                    (Boolean(transaction.getMeta("composition")) ||
                      isAnyImeCompositionActive()));
            if (!isSafariBrowser()) return { safariSentinelPos: null, userEditDeferred };

            // Once composition starts, retain the widget at the mapped block
            // start even after WebKit's pre-edit text enters the model. Removing
            // it during the same composition recreates the empty-container
            // transition that makes Safari preserve the raw pinyin. The
            // settled wake-up runs after ProseMirror's own delayed flush and
            // recomputes/removes it without creating an Undo step.
            if (
              previous.safariSentinelPos !== null &&
              isAnyImeCompositionActive() &&
              transaction.getMeta(IME_COMPOSITION_SETTLED_META) !== true
            ) {
              const mapped = transaction.mapping.mapResult(
                previous.safariSentinelPos,
                -1,
              );
              if (!mapped.deleted) {
                return { safariSentinelPos: mapped.pos, userEditDeferred };
              }
            }

            return {
              safariSentinelPos: selectedEmptyPageBlockTextStart(newState),
              userEditDeferred,
            };
          },
        },
        
























        filterTransaction(tr) {
          if (!isAnyImeCompositionActive()) return true;
          if (tr.getMeta("composition") !== undefined) return true;
          if (tr.getMeta("y-sync$") !== undefined) return true;
          if (tr.docChanged && consumeFinalCompositionInput(mountedView)) {
            return true;
          }
          return false;
        },
        props: {
          decorations(state) {
            const sentinelPos =
              imeCompositionKey.getState(state)?.safariSentinelPos ?? null;
            if (sentinelPos === null) return DecorationSet.empty;

            return DecorationSet.create(state.doc, [
              Decoration.widget(sentinelPos, createSafariImeSentinel, {
                key: "mrnote-safari-ime-empty-page-sentinel",
                side: -1,
                ignoreSelection: true,
              }),
            ]);
          },
          

















          handleKeyDown(view, event) {
            return (
              event.isTrusted === false && isImeCompositionActive(view, event)
            );
          },
        },
        view(view) {
          mountedView = view;
          const runtime = runtimeFor(view);

          const onStart = () => beginComposition(view);
          const onUpdate = () => beginComposition(view);
          const onCompositionInput = (event: Event) => {
            if (!nativeEventIsComposing(event)) return;
            beginComposition(view);
            // WebKit versions disagree whether insertFromComposition lands
            // just before or just after compositionend. Treat the final input
            // itself as an equivalent settle signal so the guard cannot remain
            // latched when that event is ordered last.
            if (
              (event as InputEvent & { inputType?: string }).inputType ===
              "insertFromComposition"
            ) {
              markFinalCompositionInput(view);
              settleComposition(view);
            }
          };
          const onEnd = () => settleComposition(view);
          const onKeyDown = (event: Event) => {
            if (!isImeCompositionActive(view, event)) return;
            const keyboardEvent = event as KeyboardEvent;
            // Only the envelope after compositionend is still latched: the
            // key itself is not an IME key (no isComposing, no 229) and
            // ProseMirror owns no composition. The IME no longer has the
            // keyboard, so the envelope ends now and the key reaches the
            // editor. Its release timer runs late on a busy page (a long
            // document, a collaborator's ink): an Enter typed right after a
            // Chinese phrase was held back, WebKit inserted its own <br>, and
            
            const runtime = runtimes.get(view);
            if (
              runtime?.active === true &&
              !view.composing &&
              !nativeEventIsComposing(event)
            ) {
              releaseComposition(view, runtime);
              return;
            }
            const isSaveShortcut =
              (keyboardEvent.metaKey || keyboardEvent.ctrlKey) &&
              !keyboardEvent.altKey &&
              !keyboardEvent.shiftKey &&
              keyboardEvent.key.toLowerCase() === "s";
            if (isSaveShortcut) {
              // The explicit save boundary waits for the committed
              // composition value. Keep the shortcut on that one command path
              // while preventing Safari's native "Save Page" action.
              keyboardEvent.preventDefault();
              return;
            }
            // Candidate digits/arrows/Enter belong exclusively to the IME.
            // Do NOT preventDefault: WebKit must still perform candidate
            // selection.  Stopping propagation keeps ProseMirror/Tiptap and
            // document/window shortcut routers from interpreting the key.
            event.stopImmediatePropagation();
          };

          // Let ProseMirror establish its mark cursor before MRNote closes the
          // transaction gate. This matters when a chosen font exists as stored
          // marks at a collapsed caret. Final input remains capture-phase so
          // its single-use token exists before WebKit's DOM reader dispatches.
          // Only composing keydown is isolated from application shortcuts.
          view.dom.addEventListener("compositionstart", onStart);
          view.dom.addEventListener("compositionupdate", onUpdate);
          view.dom.addEventListener("beforeinput", onCompositionInput, true);
          view.dom.addEventListener("input", onCompositionInput, true);
          view.dom.addEventListener("compositionend", onEnd);
          view.dom.addEventListener("keydown", onKeyDown, true);

          return {
            destroy() {
              mountedView = null;
              view.dom.removeEventListener("compositionstart", onStart);
              view.dom.removeEventListener("compositionupdate", onUpdate);
              view.dom.removeEventListener(
                "beforeinput",
                onCompositionInput,
                true,
              );
              view.dom.removeEventListener("input", onCompositionInput, true);
              view.dom.removeEventListener("compositionend", onEnd);
              view.dom.removeEventListener("keydown", onKeyDown, true);
              if (runtime.releaseTimer !== null) {
                window.clearTimeout(runtime.releaseTimer);
              }
              clearFinalCompositionInput(runtime);
              runtime.listeners.clear();
              composingViews.delete(view);
              runtimes.delete(view);
            },
          };
        },
      }),
    ];
  },
});

export default ImeCompositionGuard;
