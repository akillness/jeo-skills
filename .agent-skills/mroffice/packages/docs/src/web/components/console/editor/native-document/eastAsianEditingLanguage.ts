"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useState } from "react";

import {
  isEastAsianLanguageTag,
  useBrowserListsEastAsianLanguage,
} from "@mrnote/core/web/components/office-ribbon/officeEastAsianLanguage.ts";

import { EAL_MARK_NAME } from "./eastAsianLayoutExtension";
import { ENCLOSED_CHAR_MARK_NAME } from "./enclosedCharExtension";
import { textHasEastAsian } from "@mrnote/core/web/components/console/editor/native-document/noteTextStyle.ts";
import { PROOFING_LANGUAGE_MARK } from "./proofingLanguageExtension";

/**
 * When Word's Home tab holds Phonetic Guide, Character Border, Character
 * Shading, Enclose Characters and Asian Layout.
 *
 * Word shows them once an East Asian language is enabled among the editing
 * languages, whatever the interface language (Microsoft Learn, "My Language
 * Preferences: Office Editing Languages" and "Phonetic Guides, Yomi, Furigana,
 * or Ruby Text"; Microsoft Support, "Turn on East Asian language features").
 * That setting is the person's, stays on once made, and takes the East Asian
 * interface languages by default. MRAI has no such setting, so the same
 * question goes to what stands for it. Any one answers yes:
 *
 *  1. The interface is Chinese, Japanese or Korean: Word in that language has
 *     such an editing language.
 *  2. The browser's language list names one: the person's own statement of the
 *     languages they use, as the editing language list is.
 *  3. The document is an East Asian editing job, read by `documentCallsFor-
 *     EastAsianTools` below. Word needs no such reading because its setting
 *     already says so; here, someone editing Chinese under an English interface
 *     would otherwise have no way to these tools.
 *
 * Yes holds for the rest of the document's session, as Word's setting does not
 * flip while typing: deleting the last Chinese character does not take the
 * buttons away under the pointer. A CJK input method cannot be read from a web
 * page, but what it types reaches the document and answers 3.
 */

interface EditorWithDocument {
  readonly state: { readonly doc: ProseMirrorNode };
}

const EAST_ASIAN_STRUCTURE_MARKS = new Set([
  EAL_MARK_NAME,
  ENCLOSED_CHAR_MARK_NAME,
]);

/** Keyed by node: an edit rebuilds only the path to it, so a keystroke in a
 * long English document reads one paragraph, not all of them. */
const nodeAnswers = new WeakMap<ProseMirrorNode, boolean>();

function nodeCallsForEastAsianTools(node: ProseMirrorNode): boolean {
  if (node.isText) {
    return (
      textHasEastAsian(node.text ?? "") ||
      node.marks.some(
        (mark) =>
          EAST_ASIAN_STRUCTURE_MARKS.has(mark.type.name) ||
          (mark.type.name === PROOFING_LANGUAGE_MARK &&
            isEastAsianLanguageTag(mark.attrs.eastAsia)),
      )
    );
  }
  const known = nodeAnswers.get(node);
  if (known !== undefined) return known;
  let answer = node.type.name === "ruby";
  if (!answer && node.isLeaf && node.type.spec.leafText) {
    answer = textHasEastAsian(node.type.spec.leafText(node));
  }
  for (let index = 0; !answer && index < node.childCount; index += 1) {
    answer = nodeCallsForEastAsianTools(node.child(index));
  }
  nodeAnswers.set(node, answer);
  return answer;
}

/**
 * Whether the document itself asks for the East Asian tools: it declares an
 * East Asian language (`w:lang/@w:eastAsia` on its defaults or on a run, or the
 * language picked in Set Proofing Language), holds East Asian text, or holds
 * what only those tools make (a phonetic guide, an enclosure, an Asian layout),
 * which has to stay reachable to be changed. A declared `en-US` is no such
 * language: English Word writes it.
 *
 * `w:themeFontLang/@w:eastAsia` is deliberately not read. It only picks a theme
 * font (Open XML, ThemeFontLanguages), and English Mac Word writes `ja-JP` in a
 * blank document: 21 of the 45 .docx files in this repository carry it over
 * `w:lang w:eastAsia="en-US"` with no East Asian text, and reading it would put
 * these tools on every such English document.
 */
export function documentCallsForEastAsianTools(doc: ProseMirrorNode): boolean {
  return (
    isEastAsianLanguageTag(doc.attrs.eastAsianLanguage) ||
    nodeCallsForEastAsianTools(doc)
  );
}

/**
 * Whether Home hosts the East Asian tools. A yes holds for the document's
 * editor and page, not for the header or footer story open on it, whose own
 * text can answer yes but whose silence says nothing about the body. Read from
 * the documents themselves while rendering: the toolbar's snapshot is the
 * previous editor's for the first render after a switch, and a yes taken from
 * it would carry a Chinese page's tools over to the next one.
 */
export function useEastAsianHomeTools(input: {
  readonly locale: string;
  readonly documentEditor: EditorWithDocument;
  readonly activeEditor: EditorWithDocument;
  readonly pageId: string | null | undefined;
}): boolean {
  const { locale, documentEditor, activeEditor, pageId } = input;
  const browserLists = useBrowserListsEastAsianLanguage();
  const documentCalls =
    documentCallsForEastAsianTools(documentEditor.state.doc) ||
    documentCallsForEastAsianTools(activeEditor.state.doc);
  const [held, setHeld] = useState({ documentEditor, pageId, yes: documentCalls });
  const sameScope =
    held.documentEditor === documentEditor && held.pageId === pageId;
  // Adjusted while rendering, as React's "storing information from previous
  // renders": the branch settles after one pass.
  if (!sameScope || (documentCalls && !held.yes)) {
    setHeld({ documentEditor, pageId, yes: documentCalls });
  }
  return (
    isEastAsianLanguageTag(locale) ||
    browserLists ||
    documentCalls ||
    (sameScope && held.yes)
  );
}
