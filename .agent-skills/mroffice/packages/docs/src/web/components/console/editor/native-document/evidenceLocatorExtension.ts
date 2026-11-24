"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * Memory-evidence source locator — TipTap wiring + pure quote-search logic.
 *
 * The memory evidence panel's "view source" action opens the source page and
 * asks its editor to jump to the quoted passage. This extension provides the
 * jump: `locateEvidenceQuote` re-finds the quote against the CURRENT document
 * (never trusting recorded offsets as positions — the document may have been
 * edited since the evidence was written), selects it, scrolls it into view,
 * and paints a temporary inline "flash" decoration that auto-clears after a
 * few seconds (the fade itself is CSS — see `.mrnote-evidence-flash` in
 * note-editor.css).
 *
 * VIEW-ONLY + ADDITIVE: the highlight is a ProseMirror DECORATION, never a
 * mark — nothing about the document JSON changes, the transactions carry
 * `addToHistory: false`, and a document that never receives a locate request
 * renders byte-for-byte unchanged (empty decoration set).
 *
 * GRACEFUL DEGRADATION: when the quote no longer matches (source text edited
 * away), the command returns `false` and does nothing — the caller already
 * opened the page, which is the agreed fallback. No error surface.
 */

/** Transaction-meta payloads used to set/clear the flash decoration. */
interface EvidenceFlashMeta {
  type: "flash" | "clear";
  from?: number;
  to?: number;
}

const EVIDENCE_FLASH_META = "evidenceLocatorFlash";

export const evidenceLocatorPluginKey = new PluginKey<DecorationSet>(
  "evidenceLocator",
);

export const EVIDENCE_FLASH_CLASS = "mrnote-evidence-flash";

/** How long the flash decoration stays before it is auto-cleared. */
export const EVIDENCE_FLASH_DURATION_MS = 4000;

export interface EvidenceQuoteLocateInput {
  /** The evidence's quoted source excerpt (primary locator). */
  quoteText: string;
  /**
   * Optional plain-text offset recorded at evidence-write time. Used ONLY to
   * pick the nearest occurrence when the quote appears more than once.
   */
  startOffset?: number | null;
}

export interface QuoteRange {
  from: number;
  to: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    evidenceLocator: {
      /**
       * Find the quoted passage in the current document, select it, scroll it
       * into view, and flash a temporary highlight. Returns false (no-op)
       * when the quote no longer matches — graceful degradation to "page is
       * open" with no error.
       */
      locateEvidenceQuote: (input: EvidenceQuoteLocateInput) => ReturnType;
      /** Clear the flash highlight (auto-invoked after the flash duration). */
      clearEvidenceHighlight: () => ReturnType;
    };
  }
}

interface TextSegment {
  /** Range inside the concatenated search text. */
  start: number;
  end: number;
  /** ProseMirror position of the segment's first character. */
  pmStart: number;
}

/**
 * Find the quoted text in a document and map it to a ProseMirror range
 * (PURE — no DOM, no plugin state; unit-testable headlessly).
 *
 * The document's textblocks are flattened into one search string with `\n`
 * between blocks (and an object-replacement placeholder for non-text inline
 * leaves, so text on either side of an image can never falsely concatenate).
 * The quote is matched exactly first, then case-insensitively. When it occurs
 * more than once, `startOffsetHint` (a plain-text offset recorded at evidence
 * time) picks the nearest occurrence; without a hint the first one wins.
 * Returns null when the quote is absent — the caller degrades gracefully.
 */
export function findQuoteRange(
  doc: ProseMirrorNode,
  quoteText: string,
  startOffsetHint?: number | null,
): QuoteRange | null {
  const quote = String(quoteText ?? "").trim();
  if (!quote) return null;

  let text = "";
  const segments: TextSegment[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (text.length > 0) text += "\n";
    node.forEach((child, offset) => {
      if (child.isText && typeof child.text === "string") {
        segments.push({
          start: text.length,
          end: text.length + child.text.length,
          pmStart: pos + 1 + offset,
        });
        text += child.text;
      } else {
        // Non-text inline leaf (image, hard break, footnote ref, ...): a
        // placeholder keeps the neighbours non-adjacent in the search text.
        text += "￼";
      }
    });
    // The textblock's inline children were handled above; don't descend.
    return false;
  });

  if (text.length === 0) return null;

  const matchIndexes = (haystack: string, needle: string): number[] => {
    const out: number[] = [];
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      out.push(index);
      index = haystack.indexOf(needle, index + 1);
    }
    return out;
  };

  let matches = matchIndexes(text, quote);
  let matchLength = quote.length;
  if (matches.length === 0) {
    // Case-insensitive fallback. toLowerCase is length-preserving for the
    // overwhelmingly common cases, so index math stays aligned.
    const lowerText = text.toLowerCase();
    const lowerQuote = quote.toLowerCase();
    if (lowerText.length === text.length && lowerQuote.length === quote.length) {
      matches = matchIndexes(lowerText, lowerQuote);
      matchLength = lowerQuote.length;
    }
  }
  if (matches.length === 0) return null;

  let matchStart = matches[0];
  if (
    matches.length > 1 &&
    typeof startOffsetHint === "number" &&
    Number.isFinite(startOffsetHint)
  ) {
    matchStart = matches.reduce((best, candidate) =>
      Math.abs(candidate - startOffsetHint) < Math.abs(best - startOffsetHint)
        ? candidate
        : best,
    );
  }
  const matchEnd = matchStart + matchLength;

  const positionAt = (textIndex: number, inclusiveEnd: boolean): number | null => {
    for (const segment of segments) {
      const probe = inclusiveEnd ? textIndex - 1 : textIndex;
      if (probe >= segment.start && probe < segment.end) {
        return segment.pmStart + (textIndex - segment.start);
      }
    }
    return null;
  };

  const from = positionAt(matchStart, false);
  const to = positionAt(matchEnd, true);
  if (from === null || to === null || to <= from) return null;
  return { from, to };
}

/** Build the flash DecorationSet for one located range. */
function flashDecorations(doc: ProseMirrorNode, from: number, to: number): DecorationSet {
  return DecorationSet.create(doc, [
    Decoration.inline(from, to, { class: EVIDENCE_FLASH_CLASS }),
  ]);
}

/** True when the state currently carries a flash decoration (test hook). */
export function hasEvidenceFlash(state: EditorState): boolean {
  const set = evidenceLocatorPluginKey.getState(state);
  return Boolean(set && set.find().length > 0);
}

const EvidenceLocator = Extension.create({
  name: "evidenceLocator",

  addStorage() {
    return {
      clearTimer: null as ReturnType<typeof setTimeout> | null,
    };
  },

  onDestroy() {
    if (this.storage.clearTimer !== null) {
      clearTimeout(this.storage.clearTimer);
      this.storage.clearTimer = null;
    }
  },

  addCommands() {
    return {
      locateEvidenceQuote:
        (input: EvidenceQuoteLocateInput) =>
        ({ state, tr, dispatch, editor }) => {
          const range = findQuoteRange(
            state.doc,
            input?.quoteText ?? "",
            input?.startOffset ?? null,
          );
          if (!range) return false; // quote gone — degrade to "page opened"
          if (dispatch) {
            tr.setSelection(TextSelection.create(tr.doc, range.from, range.to));
            tr.setMeta(EVIDENCE_FLASH_META, {
              type: "flash",
              from: range.from,
              to: range.to,
            } satisfies EvidenceFlashMeta);
            // View-only: the flash must never enter the undo history.
            tr.setMeta("addToHistory", false);
            tr.scrollIntoView();
            dispatch(tr);
            if (this.storage.clearTimer !== null) {
              clearTimeout(this.storage.clearTimer);
            }
            this.storage.clearTimer = setTimeout(() => {
              this.storage.clearTimer = null;
              if (!editor.isDestroyed) {
                editor.commands.clearEvidenceHighlight();
              }
            }, EVIDENCE_FLASH_DURATION_MS);
          }
          return true;
        },

      clearEvidenceHighlight:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(EVIDENCE_FLASH_META, {
              type: "clear",
            } satisfies EvidenceFlashMeta);
            tr.setMeta("addToHistory", false);
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: evidenceLocatorPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr: Transaction, value: DecorationSet) => {
            const meta = tr.getMeta(EVIDENCE_FLASH_META) as
              | EvidenceFlashMeta
              | undefined;
            if (meta?.type === "flash" &&
                typeof meta.from === "number" &&
                typeof meta.to === "number") {
              return flashDecorations(tr.doc, meta.from, meta.to);
            }
            if (meta?.type === "clear") return DecorationSet.empty;
            return value.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return evidenceLocatorPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});

export default EvidenceLocator;
