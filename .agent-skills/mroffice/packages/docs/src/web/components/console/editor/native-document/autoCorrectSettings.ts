/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { InputRule } from "@tiptap/core";

/**
 * Word's AutoCorrect options (Microsoft Support, "Choose AutoCorrect options
 * for capitalization, spelling, and symbols"; "AutoFormat as you type";
 * Word for Mac: Tools > AutoCorrect Options):
 *
 * AutoCorrect tab, every box on by default: Correct TWo INitial CApitals,
 * Capitalize first letter of sentences, Capitalize first letter of table
 * cells, Capitalize names of days, Correct accidental usage of cAPS LOCK key,
 * Replace text as you type (the replacement list). Exceptions: words after
 * which a sentence does not end (abbreviations ending in a period) and words
 * whose two initial capitals stay.
 *
 * AutoFormat As You Type tab, on by default: "Straight quotes" with "smart
 * quotes", Fractions (1/2) with fraction character (½), Ordinals (1st) with
 * superscript, Hyphens (--) with dash (—), Automatic bulleted lists,
 * Automatic numbered lists. Off by default: *Bold* and _italic_ with real
 * formatting (on in Word for Mac's defaults too; Microsoft lists it among
 * the AutoFormat As You Type options, on in current Word).
 *
 * The options are the user's own on this device, as Word keeps them in the
 * user's profile; the replacement list starts with Word's symbol entries and
 * a set of its common typo entries.
 */

export interface AutoCorrectEntry {
  readonly from: string;
  readonly to: string;
}

export interface AutoCorrectSettings {
  readonly correctTwoInitialCapitals: boolean;
  readonly capitalizeSentences: boolean;
  readonly capitalizeTableCells: boolean;
  readonly capitalizeDayNames: boolean;
  readonly correctCapsLock: boolean;
  readonly replaceText: boolean;
  readonly entries: readonly AutoCorrectEntry[];
  readonly firstLetterExceptions: readonly string[];
  readonly initialCapsExceptions: readonly string[];
  readonly smartQuotes: boolean;
  readonly fractions: boolean;
  readonly ordinals: boolean;
  readonly hyphensWithDash: boolean;
  readonly boldItalic: boolean;
  readonly automaticBulletedLists: boolean;
  readonly automaticNumberedLists: boolean;
}

/** Word's symbol entries, then common typos from its list. */
export const DEFAULT_AUTOCORRECT_ENTRIES: readonly AutoCorrectEntry[] = [
  { from: "(c)", to: "©" },
  { from: "(e)", to: "€" },
  { from: "(r)", to: "®" },
  { from: "(tm)", to: "™" },
  { from: "...", to: "…" },
  { from: ":(", to: "☹" },
  { from: ":)", to: "☺" },
  { from: ":-(", to: "☹" },
  { from: ":-)", to: "☺" },
  { from: "-->", to: "→" },
  { from: "<--", to: "←" },
  { from: "<=>", to: "⇔" },
  { from: "==>", to: "➔" },
  { from: "<==", to: "⇐" },
  { from: "abbout", to: "about" },
  { from: "abotu", to: "about" },
  { from: "accomodate", to: "accommodate" },
  { from: "acheive", to: "achieve" },
  { from: "adn", to: "and" },
  { from: "agian", to: "again" },
  { from: "alot", to: "a lot" },
  { from: "andt he", to: "and the" },
  { from: "beacuse", to: "because" },
  { from: "becasue", to: "because" },
  { from: "beleive", to: "believe" },
  { from: "calender", to: "calendar" },
  { from: "comming", to: "coming" },
  { from: "definately", to: "definitely" },
  { from: "didnt", to: "didn't" },
  { from: "doesnt", to: "doesn't" },
  { from: "dont", to: "don't" },
  { from: "embarass", to: "embarrass" },
  { from: "enviroment", to: "environment" },
  { from: "freind", to: "friend" },
  { from: "goverment", to: "government" },
  { from: "hte", to: "the" },
  { from: "isnt", to: "isn't" },
  { from: "i'm", to: "I'm" },
  { from: "i've", to: "I've" },
  { from: "i'll", to: "I'll" },
  { from: "i'd", to: "I'd" },
  { from: "occured", to: "occurred" },
  { from: "occurence", to: "occurrence" },
  { from: "recieve", to: "receive" },
  { from: "recieved", to: "received" },
  { from: "seperate", to: "separate" },
  { from: "seperately", to: "separately" },
  { from: "succesful", to: "successful" },
  { from: "teh", to: "the" },
  { from: "thier", to: "their" },
  { from: "tommorow", to: "tomorrow" },
  { from: "tomorow", to: "tomorrow" },
  { from: "truely", to: "truly" },
  { from: "untill", to: "until" },
  { from: "wasnt", to: "wasn't" },
  { from: "wich", to: "which" },
  { from: "wiht", to: "with" },
  { from: "yuo", to: "you" },
];

/** Word's First Letter exceptions: a period after these ends no sentence. */
export const DEFAULT_FIRST_LETTER_EXCEPTIONS: readonly string[] = [
  "a.m.", "abbr.", "approx.", "apr.", "aug.", "c.", "ca.", "cf.", "co.", "corp.", "dec.", "dept.", "dr.",
  "e.g.", "etc.", "feb.", "fig.", "i.e.", "inc.", "jan.", "jr.", "jul.", "jun.", "ltd.", "mar.", "mr.",
  "mrs.", "ms.", "no.", "nov.", "oct.", "p.", "p.m.", "pp.", "prof.", "sep.", "sept.", "sr.", "st.", "vol.",
  "vs.",
];

/** Plurals of abbreviations keep their two capitals. */
export const DEFAULT_INITIAL_CAPS_EXCEPTIONS: readonly string[] = ["CDs", "IDs", "PCs", "TVs"];

export const DEFAULT_AUTOCORRECT_SETTINGS: AutoCorrectSettings = {
  correctTwoInitialCapitals: true,
  capitalizeSentences: true,
  capitalizeTableCells: true,
  capitalizeDayNames: true,
  correctCapsLock: true,
  replaceText: true,
  entries: DEFAULT_AUTOCORRECT_ENTRIES,
  firstLetterExceptions: DEFAULT_FIRST_LETTER_EXCEPTIONS,
  initialCapsExceptions: DEFAULT_INITIAL_CAPS_EXCEPTIONS,
  smartQuotes: true,
  fractions: true,
  ordinals: true,
  hyphensWithDash: true,
  boldItalic: true,
  automaticBulletedLists: true,
  automaticNumberedLists: true,
};

const STORAGE_KEY = "mrnote.autoCorrect.options";
const MAX_ENTRIES = 2_000;
const MAX_ENTRY_LENGTH = 255;

const BOOLEAN_KEYS = [
  "correctTwoInitialCapitals",
  "capitalizeSentences",
  "capitalizeTableCells",
  "capitalizeDayNames",
  "correctCapsLock",
  "replaceText",
  "smartQuotes",
  "fractions",
  "ordinals",
  "hyphensWithDash",
  "boldItalic",
  "automaticBulletedLists",
  "automaticNumberedLists",
] as const satisfies readonly (keyof AutoCorrectSettings)[];

function cleanEntries(value: unknown): AutoCorrectEntry[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const out: AutoCorrectEntry[] = [];
  for (const item of value.slice(0, MAX_ENTRIES)) {
    if (!item || typeof item !== "object") continue;
    const from = (item as { from?: unknown }).from;
    const to = (item as { to?: unknown }).to;
    if (typeof from !== "string" || typeof to !== "string") continue;
    const key = from.trim();
    if (!key || /\s$/.test(from) || key.length > MAX_ENTRY_LENGTH || to.length > MAX_ENTRY_LENGTH) continue;
    if (seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    out.push({ from: key, to: to.replace(/[\r\n]+/g, " ") });
  }
  return out;
}

function cleanWords(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item && !/\s/.test(item) && item.length <= 64),
    ),
  ].slice(0, MAX_ENTRIES);
}

export function normalizeAutoCorrectSettings(value: unknown): AutoCorrectSettings {
  if (!value || typeof value !== "object") return DEFAULT_AUTOCORRECT_SETTINGS;
  const raw = value as Record<string, unknown>;
  const next: Record<string, unknown> = { ...DEFAULT_AUTOCORRECT_SETTINGS };
  for (const key of BOOLEAN_KEYS) if (typeof raw[key] === "boolean") next[key] = raw[key];
  next.entries = cleanEntries(raw.entries) ?? DEFAULT_AUTOCORRECT_ENTRIES;
  next.firstLetterExceptions = cleanWords(raw.firstLetterExceptions) ?? DEFAULT_FIRST_LETTER_EXCEPTIONS;
  next.initialCapsExceptions = cleanWords(raw.initialCapsExceptions) ?? DEFAULT_INITIAL_CAPS_EXCEPTIONS;
  return next as unknown as AutoCorrectSettings;
}

let current: AutoCorrectSettings | null = null;
const listeners = new Set<() => void>();

/** The options now in force (read at the moment a rule would fire). */
export function getAutoCorrectSettings(): AutoCorrectSettings {
  if (current) return current;
  let stored: unknown = null;
  try {
    const text = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
    stored = text ? JSON.parse(text) : null;
  } catch {
    stored = null;
  }
  current = normalizeAutoCorrectSettings(stored);
  return current;
}

export function setAutoCorrectSettings(next: AutoCorrectSettings): void {
  current = normalizeAutoCorrectSettings(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // A private window keeps the options for this session only.
  }
  for (const listener of listeners) listener();
}

export function subscribeAutoCorrectSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tests: forget the cached options. */
export function resetAutoCorrectSettingsForTests(next?: Partial<AutoCorrectSettings>): void {
  current = next ? normalizeAutoCorrectSettings({ ...DEFAULT_AUTOCORRECT_SETTINGS, ...next }) : null;
}

/** An input rule that runs only while its AutoFormat As You Type box is on
 * (Automatic bulleted / numbered lists). */
export function gateInputRulesByAutoCorrect(
  rules: readonly InputRule[],
  option: "automaticBulletedLists" | "automaticNumberedLists",
): InputRule[] {
  return rules.map(
    (rule) =>
      new InputRule({
        find: rule.find,
        undoable: rule.undoable,
        handler: (props) => (getAutoCorrectSettings()[option] ? rule.handler(props) : null),
      }),
  );
}
