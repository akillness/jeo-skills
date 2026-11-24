"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useSyncExternalStore } from "react";

/**
 * Office's "East Asian language" question, for a web page.
 *
 * Office decides its East Asian commands by whether an East Asian language is
 * among the user's editing languages, not by the language of the interface
 * (Microsoft Learn, "My Language Preferences: Office Editing Languages": "If
 * Chinese (PRC) is included in the Editing Language list, the Enclose
 * Characters button will appear in the Word ribbon"). A browser has no such
 * list, and the nearest thing that belongs to the person is the list of
 * languages they told the browser or the system they read and write.
 */

/** Chinese, Japanese or Korean, in any region or script: `zh-Hant-TW`, `ko`. */
export function isEastAsianLanguageTag(tag: unknown): boolean {
  return typeof tag === "string" && /^(zh|ja|ko)(-|$)/i.test(tag);
}

function browserListsEastAsianLanguage(): boolean {
  if (typeof navigator === "undefined") return false;
  const languages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  return languages.some(isEastAsianLanguageTag);
}

function subscribeBrowserLanguages(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
}

/** Hydration-safe: the server renders as if the browser named none. */
export function useBrowserListsEastAsianLanguage(): boolean {
  return useSyncExternalStore(
    subscribeBrowserLanguages,
    browserListsEastAsianLanguage,
    () => false,
  );
}
