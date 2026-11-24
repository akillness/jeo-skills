/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Text the ribbon inserts while a footnote or endnote is being edited goes
 * into that note, as Word's Insert > Symbol does in a note.
 *
 * A note's text is its own editable island (a page's footnote zone, the
 * endnote list), outside the body editor; a dialog or a menu takes the
 * focus from it, and the body editor still holds its own remembered caret.
 * Inserting through the body editor wrote the symbol after the note's
 * reference in the body text (live Word audit WUA 053). The note and its
 * selection are kept as text offsets, so the island can be found and
 * selected again even when its page was drawn anew meanwhile.
 */
import { noteIslandSelectionOffsets, selectNoteIslandRange } from "@mrnote/core/web/components/console/editor/native-document/paged/pagedEditingExtension.ts";

export interface NoteBodyTarget {
  readonly noteId: string;
  readonly body: HTMLElement;
  readonly start: number;
  readonly end: number;
}

const EDITABLE_NOTE_BODY = '[data-footnote-body][contenteditable="true"]';

/** The note body `node` is in and its selection now, or null. */
export function noteBodyTargetAt(node: Node | null): NoteBodyTarget | null {
  const element = node instanceof Element ? node : node?.parentElement ?? null;
  const body = element?.closest<HTMLElement>(EDITABLE_NOTE_BODY) ?? null;
  const noteId = body?.getAttribute("data-footnote-body");
  if (!body || !noteId) return null;
  const offsets = noteIslandSelectionOffsets(body);
  const end = body.textContent?.length ?? 0;
  return { noteId, body, start: offsets?.start ?? end, end: offsets?.end ?? end };
}

/** The island of `target`'s note now: the same element, or its redrawn one. */
function liveNoteBody(target: NoteBodyTarget, doc: Document): HTMLElement | null {
  if (target.body.isConnected && target.body.getAttribute("contenteditable") === "true") return target.body;
  return doc.querySelector<HTMLElement>(
    `[data-footnote-body="${CSS.escape(target.noteId)}"][contenteditable="true"]`,
  );
}

/**
 * Type `text` over the kept selection of the note, as typing would (the
 * island commits it when it loses the focus). Returns where the caret is
 * after it, or null when the note can no longer be written.
 */
export function insertTextIntoNoteBody(
  target: NoteBodyTarget,
  text: string,
  doc: Document = document,
): NoteBodyTarget | null {
  const body = liveNoteBody(target, doc);
  if (!body || !text) return null;
  body.focus({ preventScroll: true });
  selectNoteIslandRange(body, target.start, target.end);
  if (!doc.execCommand("insertText", false, text)) return null;
  return noteBodyTargetAt(body) ?? { ...target, body, start: target.start + text.length, end: target.start + text.length };
}
