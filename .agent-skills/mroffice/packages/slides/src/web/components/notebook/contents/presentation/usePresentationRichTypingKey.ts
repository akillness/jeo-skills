"use client";






























/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Component, createElement, useCallback, useLayoutEffect, useRef, useState, type ReactElement } from "react";

import { coeditTrace, coeditTraceOn } from "@mrnote/core/web/hooks/usePageContentSync.ts";
import { textSplice } from "@mrnote/core/web/lib/collab/json-crdt.ts";
import {
  mapOffsetThroughTextChange,
  presentationPreviewPlainText,
  presentationPreviewSelection,
  setPresentationPreviewSelection,
} from "@mrnote/core/web/lib/presentation/text-selection.ts";

/** The letters typed in place since the host's words were last committed:
 * those words, what the host holds now, the caret after the last letter. */
interface TypedInPlace {
  readonly before: string;
  readonly after: string;
  readonly caret: number;
}

/** A plain letter by what the input says (the window holds its render for these). */
export function inputIsLetterInPlace(event: Event): boolean {
  const input = event as InputEvent;
  return (
    input.inputType === "insertText" &&
    !input.isComposing &&
    Boolean(input.data) &&
    !/[\r\n\t\v\f\u2028\u2029]/.test(input.data ?? "")
  );
}

/** Whether the browser's input is a letter typed in place in `host`. */
function typedInPlace(event: InputEvent, host: HTMLElement, before: string, words: string): TypedInPlace | null {
  if (!inputIsLetterInPlace(event) || event.defaultPrevented) return null;
  const data = event.data ?? "";
  const selection = host.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.rangeCount !== 1 || !selection.isCollapsed) return null;
  const anchor = selection.anchorNode;
  if (!anchor || anchor.nodeType !== Node.TEXT_NODE || !host.contains(anchor)) return null;
  if (anchor.parentElement?.closest('[contenteditable="false"]')) return null;
  if (presentationPreviewPlainText(host) !== words) return null;
  const range = presentationPreviewSelection(host, words.length);
  if (!range || range.start !== range.end) return null;
  return {
    before,
    after: words.slice(0, range.start) + data + words.slice(range.start),
    caret: range.start + data.length,
  };
}










export function presentationCaretThroughWords(
  before: string,
  after: string,
  offset: number,
  /** Which words beside the caret it keeps to first: those after it (a caret), or before it (an edit's start, so a
   * letter put back goes after the words it was typed after, not after a copy of itself already drawn). */
  side: "after" | "before" = "after",
): number {
  if (before === after) return Math.min(offset, after.length);
  let prefix = 0;
  const limit = Math.min(before.length, after.length);
  while (prefix < limit && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix += 1;
  let suffix = 0;
  while (suffix < limit - prefix && before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)) suffix += 1;
  if (offset <= prefix) return offset;
  // (At the very end of the span that differs, an edit's start keeps to the
  // words before it: what was put in there may be its own letter.)
  if (side === "after" ? offset >= before.length - suffix : offset > before.length - suffix) return offset + after.length - before.length;
  // Inside a span that differs: the longest run of the words just after the
  // caret (else just before it) found nearest where it stood.
  const near = (needle: string, at: number): number | null => {
    let best: number | null = null;
    for (let from = after.indexOf(needle); from >= 0; from = after.indexOf(needle, from + 1)) {
      if (best === null || Math.abs(from - at) < Math.abs(best - at)) best = from;
    }
    return best;
  };
  for (let length = 24; length >= 2; length -= 1) {
    const right = before.slice(offset, offset + length);
    const left = before.slice(Math.max(0, offset - length), offset);
    const byRight = () => {
      if (right.length !== length) return null;
      return near(right, offset);
    };
    const byLeft = () => {
      if (left.length !== length) return null;
      const found = near(left, offset - length);
      return found === null ? null : found + length;
    };
    const found = side === "after" ? byRight() ?? byLeft() : byLeft() ?? byRight();
    if (found !== null) return found;
  }
  return mapOffsetThroughTextChange(before, after, offset);
}









export function presentationHostEditSplice(
  drawn: string,
  shown: string,
  caret: number | null,
): { start: number; end: number; insert: string } {
  let { start, end, insert } = textSplice(drawn, shown);
  if (caret === null) return { start, end, insert };
  if (end === start && insert) {
    // An insertion ends at the caret: slide it back over the equal letters before it.
    while (start + insert.length > caret && start > 0 && drawn[start - 1] === insert[insert.length - 1]) {
      insert = drawn[start - 1] + insert.slice(0, -1);
      start -= 1;
      end -= 1;
    }
  } else if (!insert && end > start) {
    // A deletion leaves the caret at its start.
    while (start > caret && drawn[start - 1] === drawn[end - 1]) {
      start -= 1;
      end -= 1;
    }
  }
  return { start, end, insert };
}

/**
 * How many characters must be taken out of one text and put into it to make
 * the other (a changed character counts both),
 * over what lies between their common start and end; a middle too long to
 * compare costs its longer length.
 */
export function presentationTextDistance(a: string, b: string): number {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end += 1;
  const x = a.slice(start, a.length - end);
  const y = b.slice(start, b.length - end);
  if (!x.length || !y.length) return x.length + y.length;
  if (x.length * y.length > 250_000) return Math.max(x.length, y.length);
  let previous = Array.from({ length: y.length + 1 }, (_, index) => index);
  for (let i = 1; i <= x.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= y.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 2));
    }
    previous = current;
  }
  return previous[y.length];
}

/**
 * This person's edit of `edit.base` (its replaced range and what they typed)
 * typed again into the host now showing `words`, where it carries to, the
 * caret after it. False when it cannot be (the words it replaced are not
 * there any more, or it would span text nodes): it is left out.
 */
export function retypePresentationHostEdit(
  host: HTMLElement,
  edit: { base: string; start: number; end: number; insert: string },
  words: string,
): boolean {
  const removed = edit.base.slice(edit.start, edit.end);
  const at = presentationCaretThroughWords(edit.base, words, edit.start, "before");
  // How much of it the words drawn hold already (the model had those letters
  // when they were drawn): of the ways the words drawn can hold a leading part
  // of it, the one whose result differs least from the words this person saw
  // (the drawing's other differences are a collaborator's, the same for
  // every way). "C" typed before "CUDA" is not held by the word's own "C"; a
  // burst's "QBKX" of "QBKXZF" is; "ab" typed into "abab" is not held by the
  
  // the letters the model had drawn, "QBKXZF QBKXZFQBKXZF ..."). An edit
  // that replaced words is held whole or not at all.
  const seen = edit.base.slice(0, edit.start) + edit.insert + edit.base.slice(edit.end);
  // Where it goes: where the words beside it carry it, or a few places off
  // (a collaborator's letter in a run of equal letters can mislead the
  // carry); the place it carries to wins a tie.
  let held = -1;
  let place = at;
  let best = Number.POSITIVE_INFINITY;
  const consider = (spot: number, length: number, whole: boolean) => {
    if (spot < 0 || spot > words.length) return;
    if (words.slice(spot, spot + length) !== edit.insert.slice(0, length)) return;
    // Not held whole: the words drawn still hold what it replaced.
    if (!whole && removed && words.slice(spot + length, spot + length + removed.length) !== removed) return;
    const result = whole
      ? words
      : words.slice(0, spot + length) + edit.insert.slice(length) + words.slice(spot + length + removed.length);
    const distance = presentationTextDistance(seen, result);
    const better =
      distance < best ||
      (distance === best && spot === at && place !== at) ||
      // A tie goes to the longer: the original's own repeat is no evidence.
      (distance === best && (spot === at || place !== at) && (whole || (held !== Number.POSITIVE_INFINITY && length > held)));
    if (better) {
      best = distance;
      held = whole ? Number.POSITIVE_INFINITY : length;
      place = spot;
    }
  };
  for (let offset = 0; offset <= 8; offset += 1) {
    for (const spot of offset ? [at - offset, at + offset] : [at]) {
      consider(spot, 0, false);
      if (!removed) for (let length = 1; length < edit.insert.length; length += 1) consider(spot, length, false);
      consider(spot, edit.insert.length, true);
    }
  }
  if (held < 0 || held === Number.POSITIVE_INFINITY) return false;
  // Partly held (no words replaced): the rest goes after what is held.
  const insert = edit.insert.slice(held);
  const from = place + held;
  if (!spliceHostWords(host, from, from + removed.length, insert)) return false;
  const caret = from + insert.length;
  setPresentationPreviewSelection(host, caret, caret);
  return presentationPreviewPlainText(host) === words.slice(0, from) + insert + words.slice(from + removed.length);
}

/** `insert` written over `start`..`end` of the host's words, inside one text
 * node (or as the only text of an empty body); false when it cannot be. */
function spliceHostWords(host: HTMLElement, start: number, end: number, insert: string): boolean {
  if (!setPresentationPreviewSelection(host, start, end)) return false;
  const selection = host.ownerDocument.defaultView?.getSelection();
  const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || range.startContainer !== range.endContainer) return false;
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    (range.startContainer as Text).replaceData(range.startOffset, range.endOffset - range.startOffset, insert);
  } else if (range.collapsed && insert) {
    // An empty body has no text to type into: the letters go in a text of their own.
    range.insertNode(host.ownerDocument.createTextNode(insert));
  } else {
    return false;
  }
  return true;
}

/**
 * The host drawn with `drawn` made to show `held` instead (the words the
 * window's typing burst holds), changed where the two differ. False when the
 * change would span text nodes: the host is left showing `drawn`.
 */
export function showPresentationHostWords(host: HTMLElement, drawn: string, held: string): boolean {
  const { start, end, insert } = textSplice(drawn, held);
  if (!spliceHostWords(host, start, end, insert)) return false;
  if (presentationPreviewPlainText(host) === held) return true;
  // (Put back as it was: the host must read as React drew it.)
  spliceHostWords(host, start, start + insert.length, drawn.slice(start, end));
  return false;
}










export const PRESENTATION_HOST_RETYPE_EVENT = "mrai-presentation-host-retype";

const OBSERVED: MutationObserverInit = {
  subtree: true,
  childList: true,
  characterData: true,
  characterDataOldValue: true,
  attributes: true,
  attributeOldValue: true,
};

/**
 * Put `records` (the browser's edits of `host`, oldest first) back, newest
 * first: the host's nodes are again the ones React drew. False when one
 * cannot be (its nodes moved since), the host then to be drawn anew.
 */
export function revertPresentationHostEdits(host: HTMLElement, records: readonly MutationRecord[]): boolean {
  const inHost = (node: Node) => node === host || host.contains(node);
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record.type === "characterData") {
      if (!inHost(record.target)) return false;
      (record.target as CharacterData).data = record.oldValue ?? "";
    } else if (record.type === "attributes") {
      const element = record.target as Element;
      if (!inHost(element) || !record.attributeName) return false;
      if (record.oldValue === null) element.removeAttribute(record.attributeName);
      else element.setAttribute(record.attributeName, record.oldValue);
    } else {
      const parent = record.target;
      if (!inHost(parent)) return false;
      const added = Array.from(record.addedNodes);
      for (let at = added.length - 1; at >= 0; at -= 1) {
        if (added[at].parentNode !== parent) return false;
        parent.removeChild(added[at]);
      }
      const next = record.nextSibling;
      if (next && next.parentNode !== parent) return false;
      for (const removed of Array.from(record.removedNodes)) {
        if (removed.parentNode) return false;
        parent.insertBefore(removed, next);
      }
    }
  }
  return true;
}

export function usePresentationRichTypingKey({
  blockId,
  text,
  enabled,
  host,
  pendingCaret,
  heldWords,
}: {
  blockId: string;
  /** The words the host draws (the model's). */
  text: string;
  /** A host is drawn for typing (the box is selected and its words drawn). */
  enabled: boolean;
  host: () => HTMLElement | null;
  /** The caret this person's commit puts back, if it is putting one back;
   * else the caret after the letter typed. */
  pendingCaret?: (blockId: string) => { start: number; end: number } | null;
  /** The words of this body the window's typing burst holds and has not drawn
   * (its live deck, a collaborator's delivery merged in), else null. */
  heldWords?: (blockId: string) => string | null;
}): PresentationRichTypingHost {
  // A host whose words came apart from the model's is replaced: a new key.
  const [repairs, setRepairs] = useState(0);
  /** What the host last committed: its words. */
  const committedRef = useRef<{ text: string; repairs: number } | null>(null);
  const typedRef = useRef<TypedInPlace | null>(null);
  /** The browser's edits of the host since React last drew its words. */
  const editsRef = useRef<MutationRecord[]>([]);
  const observedRef = useRef<{ node: HTMLElement; observer: MutationObserver; recording: boolean } | null>(null);
  /** The caret the browser shows, in the words it shows, as a render changing them began. */
  const caretBeforeRef = useRef<{ forText: string; text: string; start: number; end: number } | null>(null);
  /** React drew other words into the host under a composition: the browser's
   * edits recorded before then cannot be put back over them. */
  const taintedRef = useRef(false);
  /** Edits that could not be put back: the host is drawn anew. */
  const remountsRef = useRef(0);
  /** The edits put back before this commit could not all be: draw the host anew after it. */
  const needsRepairRef = useRef(false);
  /** This person's own edit the host showed and the words drawn do not hold
   * yet (its input still to be read, or a burst's letters the drawing was
   * started before): typed again into the drawn words after the commit. */
  const localEditRef = useRef<{ forText: string; base: string; start: number; end: number; insert: string } | null>(null);
  /** The words the host was made to show for the typing burst (`heldWords`), until the next drawing. */
  const heldShownRef = useRef<string | null>(null);
  const committed = enabled ? committedRef.current : null;
  const typed = typedRef.current;
  const keptInPlace =
    committed !== null &&
    committed.repairs === repairs &&
    typed !== null &&
    typed.before === committed.text &&
    text === typed.after;
  // An input method composing in the host keeps it as it is: a collaborator's
  // words arriving meanwhile are drawn into the same host, and its marked
  
  // host mounted anew under the composition lost 7 of 8 Chinese words).
  const composingRef = useRef(false);
  // A host whose browser edits are known not to go back over React's nodes
  // (they moved since) is drawn anew: decided before React draws.
  if (enabled && committed !== null && committed.text !== text && !keptInPlace && !composingRef.current) {
    const node = host();
    if (node && editsRef.current.some((record) => !node.contains(record.target))) {
      editsRef.current = [];
      remountsRef.current += 1;
    }
  }
  const key = enabled ? `imported-rich:${blockId}:${repairs}:${remountsRef.current}` : undefined;

  // The browser's edits are recorded from the end of an input's `beforeinput`
  // (React's own drawing for it done) to its `input`; a host drawn anew is
  // watched afresh.
  useLayoutEffect(() => {
    const node = enabled ? host() : null;
    if (!node) return;
    const observed = { node, recording: false, observer: null as unknown as MutationObserver };
    observed.observer = new MutationObserver((records) => {
      if (observed.recording) editsRef.current.push(...records);
    });
    observed.observer.observe(node, OBSERVED);
    observedRef.current = observed;
    editsRef.current = [];
    const inHost = (event: Event) => event.target instanceof Node && (event.target === node || node.contains(event.target));
    let stop = 0;
    const onBeforeInput = (event: Event) => {
      if (!inHost(event) || event.defaultPrevented) return;
      observed.observer.takeRecords();
      observed.recording = true;
      window.clearTimeout(stop);
      // An edit the browser then makes in no input stops here all the same.
      stop = window.setTimeout(() => {
        editsRef.current.push(...observed.observer.takeRecords());
        observed.recording = false;
      }, 0);
    };
    const onInput = (event: Event) => {
      if (!inHost(event)) return;
      // (An edit no `beforeinput` announced is the browser's too: nothing ran
      // between it and its input to change the host.)
      editsRef.current.push(...observed.observer.takeRecords());
      observed.recording = false;
      window.clearTimeout(stop);
    };
    const onCompositionStart = (event: Event) => {
      if (inHost(event)) composingRef.current = true;
    };
    const onCompositionEnd = () => {
      composingRef.current = false;
    };
    const view = node.ownerDocument.defaultView ?? window;
    view.addEventListener("beforeinput", onBeforeInput);
    view.addEventListener("input", onInput, true);
    view.addEventListener("compositionstart", onCompositionStart, true);
    view.addEventListener("compositionend", onCompositionEnd, true);
    return () => {
      window.clearTimeout(stop);
      view.removeEventListener("beforeinput", onBeforeInput);
      view.removeEventListener("input", onInput, true);
      view.removeEventListener("compositionstart", onCompositionStart, true);
      view.removeEventListener("compositionend", onCompositionEnd, true);
      observed.observer.disconnect();
      if (observedRef.current === observed) observedRef.current = null;
    };
  }, [enabled, host, key]);

  useLayoutEffect(() => {
    if (!enabled) {
      committedRef.current = null;
      typedRef.current = null;
      caretBeforeRef.current = null;
      return;
    }
    // What React itself just changed in the host is not the browser's edit
    // (delivered to the observer at the next microtask, or taken here).
    const observed = observedRef.current;
    if (observed && !observed.recording) observed.observer.takeRecords();
    const previous = committedRef.current;
    committedRef.current = { text, repairs };
    const changed = previous !== null && previous.text !== text;
    if (previous?.text !== text) typedRef.current = null;
    const node = host();
    const caretBefore = caretBeforeRef.current;
    caretBeforeRef.current = null;
    const localEdit = localEditRef.current?.forText === text ? localEditRef.current : null;
    localEditRef.current = null;
    const heldShown = heldShownRef.current;
    if (previous?.text !== text) heldShownRef.current = null;
    if (!node) return;
    // Under a composition the marked letters are the browser's: the host
    // stays as it is until the composition ends and commits.
    if (composingRef.current) {
      if (changed) taintedRef.current = true;
      return;
    }
    const shown = presentationPreviewPlainText(node);
    // The host shows the model's words: what the browser edited is drawn.
    if (shown === text) editsRef.current = [];
    if (needsRepairRef.current) {
      needsRepairRef.current = false;
      setRepairs((count) => count + 1);
      return;
    }
    if (!changed) {
      // The same words drawn again with other formatting (a collaborator's
      // font, size or colour on the whole box, a theme): React replaced the run
      // nodes the caret stood in, and the browser left it at the start of the
      // row. The caret goes back where it was, before the frame is painted.
      // Left there, this person's next words went in before the row's words
      
      if (
        caretBefore &&
        caretBefore.forText === text &&
        caretBefore.text === text &&
        shown === text &&
        node.contains(node.ownerDocument.activeElement)
      ) {
        const now = presentationPreviewSelection(node, text.length);
        if (!now || now.start !== caretBefore.start || now.end !== caretBefore.end) {
          setPresentationPreviewSelection(node, caretBefore.start, caretBefore.end);
          if (coeditTraceOn()) coeditTrace("host-caret-kept", { caret: [caretBefore.start, caretBefore.end], was: now ? [now.start, now.end] : null, length: text.length });
        }
      }
      return;
    }
    // A drawing that lacks words the window's typing burst holds (a
    // delivery drawn a moment after this person's letters were taken; the
    // window merged them with it): the host shows the words the window holds,
    // where it holds them. Typed again where the host had them instead, the
    // letter stood one place off from the window's, and the next drawing,
    // finding the host apart from it, typed it again (two spaces typed at a
    // row's end at once, then "Q": "RFC 9129 Q Q").
    const held = heldWords?.(blockId) ?? null;
    if (held !== null && held !== text && shown === text && showPresentationHostWords(node, text, held)) {
      // This person's edit the window has not read yet (its input still on
      // its way) goes into the words it holds.
      const retyped = localEdit !== null && retypePresentationHostEdit(node, localEdit, held);
      if (!retyped && node.contains(node.ownerDocument.activeElement) && caretBefore && caretBefore.forText === text) {
        setPresentationPreviewSelection(
          node,
          presentationCaretThroughWords(caretBefore.text, held, caretBefore.start),
          presentationCaretThroughWords(caretBefore.text, held, caretBefore.end),
        );
      }
      heldShownRef.current = presentationPreviewPlainText(node);
      if (coeditTraceOn()) coeditTrace("host-held", { length: held.length, drawn: text.length, retyped });
      node.dispatchEvent(new CustomEvent(PRESENTATION_HOST_RETYPE_EVENT, { bubbles: true, detail: { blockId } }));
      return;
    }
    // This person's own edit, put back for React, typed again into the words
    // drawn, where they carried it: what they typed is never lost to a
    
    // collaborator's delivery was being drawn for 0.5 s was put back and its
    // input then read the host without it).
    if (localEdit && shown === text && retypePresentationHostEdit(node, localEdit, text)) {
      if (coeditTraceOn()) coeditTrace("host-retype", { at: localEdit.start, insert: localEdit.insert.length, removed: localEdit.end - localEdit.start });
      node.dispatchEvent(new CustomEvent(PRESENTATION_HOST_RETYPE_EVENT, { bubbles: true, detail: { blockId } }));
      return;
    }
    // React drew the model's words over the host's nodes; they must read
    // back as the model's, or the host is drawn anew now.
    if (shown !== text) {
      setRepairs((count) => count + 1);
      return;
    }
    if (!node.contains(node.ownerDocument.activeElement)) return;
    // Writing a text node's words moves a caret inside it to its start: the
    // caret goes back before the frame is painted -- the one the commit
    // leaves, else the letter's, else the browser's carried through the change.
    // A host whose owner puts its own caret back after each drawing (a shape's
    // label: `takeShapeRichSelection` in its ref) is left to it.
    // The burst drawn as the host already showed it (its words made to show
    // them): the caret the person has in them stands; the window's own was
    // left in the words before the delivery merged into them.
    const shownCaret = heldShown === text && caretBefore && caretBefore.forText === text && caretBefore.text === text
      ? { start: caretBefore.start, end: caretBefore.end } : null;
    const caret = shownCaret ?? pendingCaret?.(blockId) ??
      (keptInPlace && typed ? { start: typed.caret, end: typed.caret } : null) ??
      (pendingCaret && caretBefore && caretBefore.forText === text
        ? {
            start: presentationCaretThroughWords(caretBefore.text, text, caretBefore.start),
            end: presentationCaretThroughWords(caretBefore.text, text, caretBefore.end),
          }
        : null);
    if (caret) setPresentationPreviewSelection(node, caret.start, caret.end);
    if (coeditTraceOn()) {
      coeditTrace("host-caret", {
        from: shownCaret ? "held" : pendingCaret?.(blockId) ? "pending" : keptInPlace && typed ? "typed" : pendingCaret && caretBefore && caretBefore.forText === text ? "mapped" : "owner",
        caret: caret ? [caret.start, caret.end] : null, before: caretBefore ? [caretBefore.start, caretBefore.text.length] : null, length: text.length,
      });
    }
  });

  useLayoutEffect(() => {
    const node = enabled ? host() : null;
    if (!node) return;
    const onBeforeInput = (event: Event) => {
      const committedWords = committedRef.current?.text;
      // Letters the window has not drawn yet are in the host: the chain goes on
      // from them, and one commit takes them all.
      const held = typedRef.current?.before === committedWords ? typedRef.current : null;
      typedRef.current =
        committedWords === undefined
          ? null
          : typedInPlace(event as InputEvent, node, committedWords, held?.after ?? committedWords);
    };
    node.addEventListener("beforeinput", onBeforeInput);
    return () => node.removeEventListener("beforeinput", onBeforeInput);
  }, [enabled, host, key]);

  /**
   * Just before React changes the DOM for a render whose words differ from the
   * host's (the before-mutation phase, never interrupted, never replayed): the
   * caret the browser shows is read in the words it shows, and the browser's
   * own edits are put back so React finds the nodes it drew. Not in the render:
   * a render React starts again read the words it had put back.
   */
  const beforeCommit = useCallback((nextText: string, nextKept: boolean, nextEnabled: boolean) => {
    caretBeforeRef.current = null;
    localEditRef.current = null;
    const previous = committedRef.current;
    if (!nextEnabled || previous === null || nextKept || composingRef.current) return;
    if (previous.text === nextText) {
      // The same words drawn again (formatting only): the caret the person
      // has in them, read before React may replace the nodes it stands in.
      const node = host();
      if (!node || !node.contains(node.ownerDocument.activeElement)) return;
      const shown = presentationPreviewPlainText(node);
      if (shown !== nextText) return;
      const range = presentationPreviewSelection(node, shown.length);
      caretBeforeRef.current = range ? { forText: nextText, text: shown, ...range } : null;
      return;
    }
    const node = host();
    if (!node) return;
    const shown = presentationPreviewPlainText(node);
    const range = node.contains(node.ownerDocument.activeElement) ? presentationPreviewSelection(node, shown.length) : null;
    caretBeforeRef.current = range ? { forText: nextText, text: shown, ...range } : null;
    // What the host shows beyond the words React last drew is this person's
    // own edit (only the browser's edits change the host between commits).
    // Taken again after the drawing unless the words drawn already hold it:
    // its input still being dispatched (React drew a delivery begun before it,
    // ahead of the input's own handler), or a drawing of the deck as it stood
    // before the letter (a typing burst holds the letter, a delivery's deck is
    // drawn without it): put back, it was gone from the host while the model
    // kept it, and the next letter went in one place on ("ZABCDEFG" + "H" + a
    
    const drawn = previous.text;
    if (shown !== drawn && shown !== nextText) {
      const splice = presentationHostEditSplice(drawn, shown, range && range.start === range.end ? range.start : null);
      localEditRef.current = { forText: nextText, base: drawn, start: splice.start, end: splice.end, insert: splice.insert };
    }
    const observed = observedRef.current;
    if (observed?.node !== node) return;
    const edits = [...editsRef.current, ...(observed.recording ? observed.observer.takeRecords() : [])];
    editsRef.current = [];
    if (taintedRef.current || (edits.length && !revertPresentationHostEdits(node, edits))) needsRepairRef.current = true;
    if (coeditTraceOn()) coeditTrace("host-revert", { edits: edits.length, repair: needsRepairRef.current, caret: range ? [range.start, range.end] : null, shown: shown.length, next: nextText.length });
    taintedRef.current = false;
  }, [host]);
  const commitGuard = enabled
    ? createElement(PresentationHostCommitGuard, { text, kept: keptInPlace, enabled, onBeforeCommit: beforeCommit })
    : null;
  return { key, commitGuard };
}

/**
 * Renders nothing; tells its host's hook, in the before-mutation phase of every
 * commit that draws new words, to ready the host for them
 * (`usePresentationRichTypingKey`). A class component: its
 * `getSnapshotBeforeUpdate` is React's only call before the DOM changes.
 */
class PresentationHostCommitGuard extends Component<{
  text: string;
  kept: boolean;
  enabled: boolean;
  onBeforeCommit: (text: string, kept: boolean, enabled: boolean) => void;
}> {
  getSnapshotBeforeUpdate(): null {
    this.props.onBeforeCommit(this.props.text, this.props.kept, this.props.enabled);
    return null;
  }

  componentDidUpdate(): void {}

  render(): null {
    return null;
  }
}

export type PresentationRichTypingHost = { key: string | undefined; commitGuard: ReactElement | null };
