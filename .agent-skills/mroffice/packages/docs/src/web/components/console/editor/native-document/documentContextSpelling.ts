/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useLocale } from "@mrnote/core/host/next-intl.tsx";

import {
  proofingStorage,
  readCustomDictionary,
  readSpellingOptions,
  writeCustomDictionary,
} from "@mrnote/core/web/lib/proofing/proofing-preferences.ts";
import {
  ignoreWordForSession,
  matchSpellingCase,
  spellingSessionIgnoredWords,
  spellingSuggestions,
  type SpellingDictionary,
} from "@mrnote/core/web/lib/proofing/spelling-checker.ts";
import {
  defaultDocumentSpellingLanguage,
  loadSpellingDictionary,
  subscribeSpellingDictionaries,
} from "@mrnote/core/web/lib/proofing/spelling-dictionaries.ts";
import type { DocumentContextMenuSpelling } from "../DocumentContextMenu";
import {
  collectDocumentEditorIssues,
  documentProofingBlockAt,
  documentProofingDictionaryTags,
} from "./documentEditorProofing";

/**
 * Word's spelling suggestions on a right-clicked word (the flagged word's
 * shortcut menu: suggestions, Ignore All, Add to Dictionary). The word is
 * checked by the Editor pane's own checker (documentEditorProofing), in the
 * browser, against the run's proofing language; a word that is not flagged
 * gives no group.
 */
const dictionaries = new Map<string, SpellingDictionary>();
const loading = new Map<string, Promise<SpellingDictionary | null>>();

function dictionary(tag: string): Promise<SpellingDictionary | null> {
  const known = dictionaries.get(tag);
  if (known) return Promise.resolve(known);
  let pending = loading.get(tag);
  if (!pending) {
    pending = loadSpellingDictionary(tag).then(
      (loaded) => {
        dictionaries.set(tag, loaded);
        return loaded;
      },
      () => null,
    );
    loading.set(tag, pending);
  }
  return pending;
}

const NO_RULES = new Set<never>();
const NO_KEYS = new Set<string>();

function spellingAt(
  editor: Editor,
  pos: number,
  defaultLanguage: string,
): Omit<DocumentContextMenuSpelling, "apply" | "ignoreAll" | "addToDictionary"> & {
  from: number;
  to: number;
  rangeText: string;
} | null {
  const block = documentProofingBlockAt(editor.state.doc, pos);
  if (!block) return null;
  const tags = documentProofingDictionaryTags([block], defaultLanguage);
  const loaded = new Map<string, SpellingDictionary>();
  for (const tag of tags) {
    const known = dictionaries.get(tag);
    if (known) loaded.set(tag, known);
  }
  if (!loaded.size) return null;
  const storage = proofingStorage();
  const options = readSpellingOptions(storage);
  const customWords = readCustomDictionary(storage);
  const ignoredWords = spellingSessionIgnoredWords(editor);
  const issue = collectDocumentEditorIssues([block], {
    defaultLanguage,
    dictionaries: loaded,
    spellingOptions: options,
    customWords,
    ignoredWords,
    disabledRules: NO_RULES,
    ignoredIssues: NO_KEYS,
  }).find(
    (candidate) =>
      candidate.category === "spelling" && candidate.from <= pos && pos <= candidate.to,
  );
  if (!issue) return null;
  const repeated = issue.rule === "repeated";
  const language = issue.language ? loaded.get(issue.language) : undefined;
  const suggestions = repeated
    ? []
    : (issue.suggestions ??
        (language
          ? spellingSuggestions(issue.text, {
              dictionary: language,
              options,
              customWords,
              ignoredWords,
            })
          : []))
        .map((suggestion) => matchSpellingCase(issue.text, suggestion))
        .filter((suggestion, index, list) => list.indexOf(suggestion) === index)
        .slice(0, 5);
  return {
    word: issue.text,
    suggestions,
    repeated,
    from: issue.from,
    to: issue.to,
    rangeText: issue.rangeText,
  };
}

/** The spelling group for a menu opened at `pos` (null: closed, or nothing
 *  flagged there). Renders again once the run's dictionary has loaded. */
export function useDocumentContextSpelling(
  editor: Editor,
  pos: number | null,
): DocumentContextMenuSpelling | null {
  const locale = useLocale();
  const [loadedTick, setLoadedTick] = useState(0);
  const defaultLanguage = defaultDocumentSpellingLanguage(
    locale,
    readSpellingOptions(proofingStorage()).dictionaryLanguage,
  );
  const loadedCount = dictionaries.size;
  useEffect(() => {
    if (pos === null || editor.isDestroyed) return;
    const block = documentProofingBlockAt(editor.state.doc, pos);
    if (!block) return;
    let live = true;
    const missing = documentProofingDictionaryTags([block], defaultLanguage).filter(
      (tag) => !dictionaries.has(tag),
    );
    for (const tag of missing) {
      void dictionary(tag).then((loaded) => {
        if (live && loaded) setLoadedTick((value) => value + 1);
      });
    }
    // The words are judged (and suggestions made) in the spelling worker:
    // the group renders again as the answers arrive.
    const present = documentProofingDictionaryTags([block], defaultLanguage)
      .map((tag) => dictionaries.get(tag))
      .filter((entry): entry is SpellingDictionary => entry !== undefined);
    const stop = subscribeSpellingDictionaries(present, () => {
      if (live) setLoadedTick((value) => value + 1);
    });
    return () => {
      live = false;
      stop();
    };
    // `loadedCount`: subscribe again once a dictionary of the block loads.
  }, [defaultLanguage, editor, loadedCount, pos]);
  if (pos === null || editor.isDestroyed) return null;
  void loadedTick;
  const found = spellingAt(editor, pos, defaultLanguage);
  if (!found) return null;
  const { from, to, rangeText, ...shown } = found;
  return {
    ...shown,
    apply: (replacement) => {
      if (editor.isDestroyed || !editor.isEditable) return;
      const { state } = editor;
      if (to > state.doc.content.size) return;
      // Only the text the menu was made for is replaced.
      if (state.doc.textBetween(from, to, "", "￼") !== rangeText) return;
      editor.view.dispatch(state.tr.insertText(replacement, from, to));
      editor.view.focus();
    },
    ignoreAll: () => {
      ignoreWordForSession(shown.word, editor);
    },
    addToDictionary: () => {
      const storage = proofingStorage();
      writeCustomDictionary(storage, [...readCustomDictionary(storage), shown.word]);
    },
  };
}
