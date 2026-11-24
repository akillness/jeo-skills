/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Track Changes modes (Review > Tracking > Track Changes).
 *
 * Word for Microsoft 365 has three states for the person editing
 * (`Word.ChangeTrackingMode`: Off / TrackAll / TrackMineOnly):
 *
 * - **For Everyone** is a property of the DOCUMENT. It is stored in the
 *   package as `<w:trackRevisions/>` in `word/settings.xml` (ECMA-376
 *   17.15.1.89), so it is saved with the document, every co-author is tracked
 *   while it is on, and a file that arrives with it on opens tracking. Here it
 *   is the doc attr `trackRevisions`, shared live through the collaborative
 *   document-attribute map like the other settings.xml switches.
 * - **Just Mine** tracks only the edits of the person who chose it. Word keeps
 *   it out of the file (nothing in settings.xml) and out of the co-authors'
 *   sessions: it is this editor session's own state, never a document attr.
 * - **Off.**
 *
 * The modes are one choice, not two switches: choosing Just Mine while the
 * document tracks For Everyone turns the document setting off (the others
 * stop being tracked, this author keeps being tracked); choosing For Everyone
 * turns the document setting on. While the document tracks For Everyone, the
 * menu shows For Everyone checked and Just Mine unchecked, whoever turned it
 * on. Lock Tracking (`w:documentProtection w:edit="trackedChanges"`) keeps the
 * document in For Everyone until it is unlocked; Word also writes
 * `w:trackRevisions` when it locks, and tracking stays on after the unlock.
 *
 * Pure: no editor/DOM imports.
 */

/** The doc attr holding Word's For Everyone setting (`w:trackRevisions`). */
export const TRACK_REVISIONS_ATTR = "trackRevisions";

export type TrackChangesMode = "off" | "everyone" | "mine";

export const TRACK_CHANGES_MODES: readonly TrackChangesMode[] = [
  "off",
  "everyone",
  "mine",
];

/** Canonical value of the doc attr: only a literal `true` turns it on. */
export function normalizeTrackRevisions(value: unknown): boolean {
  return value === true;
}

export function normalizeTrackChangesMode(value: unknown): TrackChangesMode | null {
  return TRACK_CHANGES_MODES.includes(value as TrackChangesMode)
    ? (value as TrackChangesMode)
    : null;
}

/**
 * The mode in effect for this author. The document's For Everyone setting
 * (or a tracking lock) wins over this session's Just Mine, as in Word.
 */
export function effectiveTrackChangesMode(input: {
  forEveryone: boolean;
  locked: boolean;
  justMine: boolean;
}): TrackChangesMode {
  if (input.forEveryone || input.locked) return "everyone";
  return input.justMine ? "mine" : "off";
}

/**
 * What choosing `mode` writes: the document setting and this session's Just
 * Mine flag, or null when the choice is refused (a locked document stays in
 * For Everyone).
 */
export function trackChangesModeTransition(
  mode: TrackChangesMode,
  locked: boolean,
): { forEveryone: boolean; justMine: boolean } | null {
  if (locked && mode !== "everyone") return null;
  switch (mode) {
    case "everyone":
      return { forEveryone: true, justMine: false };
    case "mine":
      return { forEveryone: false, justMine: true };
    default:
      return { forEveryone: false, justMine: false };
  }
}
