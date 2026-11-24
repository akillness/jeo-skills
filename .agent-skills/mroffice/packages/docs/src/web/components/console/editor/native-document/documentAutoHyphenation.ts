"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's automatic hyphenation on the page (`w:autoHyphenation`).
 *
 * Word hyphenates a paragraph's words by the LANGUAGE each run is in: the
 * run's own `w:lang`, else its paragraph style's, else the document
 * defaults'. A paragraph whose effective `w:suppressAutoHyphens` is set
 * (directly, through its style chain, or by the document defaults) is not
 * hyphenated (the page's `suppressAutoHyphens`, already effective). Chromium's `hyphens: auto` with the same `lang` breaks at the
 * same points Word does (measured on corpus R26-D04, Dutch: all 82 of Word's
 * hyphenated words are breaks Chromium offers), so the page states the
 * language and lets the browser hyphenate. Nothing is stored: the setting
 * itself stays the document's (`documentHyphenation`) and is exported as is.
 *
 * Not modelled (CSS has no equivalent in Chromium): the hyphenation zone, the
 * limit on consecutive hyphenated lines and "do not hyphenate capitals"
 * (documentHyphenationRules withholds what it can). Where the line engine
 * lays a paragraph out and has patterns for its words' language
 * (lib/text-engine/docs-hyphenation), it hyphenates by Word's rules itself
 * and turns these hyphens off (documentEngineLineBreaks).
 */

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { normalizeAutoHyphenation } from "@mrnote/core/web/components/console/editor/native-document/documentHyphenation.ts";
import {
  documentLanguageTag,
  documentParagraphLanguage,
  readDocumentLanguageStyles,
  type DocumentLanguageStyles,
} from "./documentParagraphLanguage";
import { PROOFING_LANGUAGE_MARK } from "./proofingLanguageExtension";
import { touchedRanges } from "@mrnote/core/web/components/console/editor/native-document/touchedTextblocks.ts";

/** `lang` moves CJK glyph fallback and line breaking: never stated for these. */
const NO_LANG_PRIMARY = new Set(["zh", "ja", "ko"]);

function usableLanguage(value: string | null): string | null {
  if (!value) return null;
  return NO_LANG_PRIMARY.has(value.split("-")[0]!.toLowerCase()) ? null : value;
}

function blockDecorations(
  doc: ProseMirrorNode,
  styles: DocumentLanguageStyles,
  from = 0,
  to = doc.content.size,
): Decoration[] {
  const decorations: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const nodeAttrs = node.attrs as Record<string, unknown>;
    // The page states the EFFECTIVE value (the reader resolves the style
    // chain and the document defaults) and only when it is on.
    const suppressed = nodeAttrs.suppressAutoHyphens === true;
    if (suppressed) return false;
    const paragraphLanguage = usableLanguage(documentParagraphLanguage(styles, node));
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        ...(paragraphLanguage ? { lang: paragraphLanguage } : {}),
        "data-auto-hyphenation": "true",
        style: "hyphens:auto;-webkit-hyphens:auto",
      }),
    );
    // A run in another language than its paragraph is hyphenated by its own.
    node.forEach((child, offset) => {
      const mark = child.marks.find((candidate) => candidate.type.name === PROOFING_LANGUAGE_MARK);
      const own = usableLanguage(documentLanguageTag(mark?.attrs.val));
      if (!child.isText || !own || own === paragraphLanguage) return;
      decorations.push(Decoration.inline(pos + 1 + offset, pos + 1 + offset + child.nodeSize, { lang: own }));
    });
    return false;
  });
  return decorations;
}

export function documentAutoHyphenationDecorations(doc: ProseMirrorNode): DecorationSet {
  const attrs = doc.attrs as Record<string, unknown>;
  if (!normalizeAutoHyphenation(attrs.autoHyphenation)) return DecorationSet.empty;
  return DecorationSet.create(doc, blockDecorations(doc, readDocumentLanguageStyles(attrs)));
}

/** After an edit: the old set mapped, the textblocks the edit touched read again. */
function updatedDecorations(tr: Transaction, mapped: DecorationSet): DecorationSet {
  const attrs = tr.doc.attrs as Record<string, unknown>;
  if (!normalizeAutoHyphenation(attrs.autoHyphenation)) return DecorationSet.empty;
  const styles = readDocumentLanguageStyles(attrs);
  const size = tr.doc.content.size;
  let set = mapped;
  // Every range a step reached, a format step (a language or a size, which
  // moves no position) included.
  for (const [rangeFrom, rangeTo] of touchedRanges(tr)) {
    const start = Math.max(0, Math.min(rangeFrom, size));
    const end = Math.max(start, Math.min(rangeTo, size));
    const $from = tr.doc.resolve(start);
    const $to = tr.doc.resolve(end);
    const from = $from.depth > 0 ? $from.before(1) : start;
    const to = $to.depth > 0 ? $to.after(1) : end;
    set = set.remove(set.find(from, to));
    set = set.add(tr.doc, blockDecorations(tr.doc, styles, from, to));
  }
  return set;
}

const documentAutoHyphenationKey = new PluginKey<DecorationSet>("documentAutoHyphenation");

export const DocumentAutoHyphenation = Extension.create({
  name: "documentAutoHyphenation",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: documentAutoHyphenationKey,
        state: {
          init: (_config, state) => documentAutoHyphenationDecorations(state.doc),
          apply: (tr, value, oldState, state) => {
            if (!tr.docChanged) return value;
            // The setting or the styles changed: read the whole document again.
            if (oldState.doc.attrs !== state.doc.attrs) return documentAutoHyphenationDecorations(state.doc);
            if (value === DecorationSet.empty) return value;
            return updatedDecorations(tr, value.map(tr.mapping, tr.doc));
          },
        },
        props: {
          decorations: (state) => documentAutoHyphenationKey.getState(state),
        },
      }),
    ];
  },
});
