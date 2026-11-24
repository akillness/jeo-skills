/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension, InputRule, type ExtendedRegExpMatchArray, type InputRuleFinder } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

import { getAutoCorrectSettings, type AutoCorrectSettings } from "./autoCorrectSettings";
import {
  BOLD_ITALIC_FIND,
  EN_DASH,
  EN_DASH_FIND,
  TEXT_TYPOGRAPHY_RULES,
  WORD_END_TRIGGER,
  correctEndedWord,
  matchSymbolEntry,
  resolveSmartQuote,
  quoteTypedInsideAddress,
  typedTextEndsInsideAddress,
  type QuoteKind,
} from "./autoCorrectRules";

/**
 * AutoCorrect / smart typography while typing — the Word/WPS "AutoFormat As You
 * Type" feature, and the local replacement for TipTap's official (not-installed)
 * `@tiptap/extension-typography`.
 *
 * Registers a set of TipTap INPUT RULES that fire on the last typed character:
 *   - straight quotes "/' → curly “ ” ‘ ’ (direction chosen contextually)
 *   - double hyphen `--` → em-dash —; spaced, "a -- b " / "a - b " → en dash –
 *   - triple dot `...` → ellipsis …
 *   - (c)/(tm)/(r) → © ™ ®
 *   - the three trivial fractions 1/2 1/4 3/4 → ½ ¼ ¾
 *
 * Pure replacement logic lives in `autoCorrectRules.ts` (unit-tested in
 * isolation); this file is only the editor wiring.
 *
 * CODE SAFETY: TipTap's input-rule runner refuses to fire inside a code block
 * (`nodeType.spec.code`) or when an adjacent node carries a `code` mark (inline
 * code) — it bails before any rule's `find` is consulted (see @tiptap/core
 * `run()`). So smart quotes / dashes never appear inside ``code`` or fenced
 * blocks. The colocated test pins this so a TipTap upgrade can't silently
 * regress it.
 *
 * TOGGLE: the feature is on by default (like Word). NoteEditor passes a live
 * `isEnabled` getter (backed by a localStorage-persisted per-device preference
 * read through a ref) so the user can turn AutoCorrect off WITHOUT rebuilding
 * the editor — the rule handlers consult the getter at fire time and no-op when
 * it returns false. When the getter is omitted (e.g. the simplifiedTraditional
 * test, which builds the registry with no options) the feature defaults to on,
 * matching production.
 *
 * SERIALIZATION: this extension adds no schema (no node/mark/attribute) and no
 * commands — it only transforms freshly typed text into different Unicode text.
 * A document that is never typed into (imported, then exported) is therefore
 * byte-for-byte unchanged; and the characters it does produce (curly quotes,
 * em-dash, ellipsis, ©/™/®, ½/¼/¾) are ordinary text that round-trips through
 * the HTML/DOCX export exactly like any other typed character.
 */

export interface AutoCorrectOptions {
  /**
   * Live predicate consulted at the moment a rule would fire. Returns `false`
   * to suppress all AutoCorrect replacements (user turned the feature off).
   * Defaults to always-on so callers that don't wire a toggle get Word-like
   * behavior out of the box.
   */
  isEnabled: () => boolean;
}

/**
 * Build a single AutoCorrect input rule from a `find` regex and a
 * `getReplacement(match)` that returns the FULL text to place over the matched
 * range.
 *
 * Why a custom `InputRule` (not `textInputRule`): TipTap's `textInputRule`
 * treats `replace` as a literal string (no `$1` back-references) and its
 * capture-group handling preserves only a *trailing* slice — neither fits our
 * rules, which (a) preserve a *leading* captured char (the char before a quote /
 * before `--`) and (b) compute the glyph from context. So we replace the whole
 * matched range ourselves.
 *
 * Range semantics on the `handleTextInput` path: the just-typed character is NOT
 * yet in the document; `range` spans the EXISTING matched doc text, and
 * `match[0]` includes the virtual typed char. The replacement we insert over
 * `[range.from, range.to]` must therefore stand in for the entire matched
 * sequence (preceding context + the typed trigger), which is exactly what
 * `getReplacement(match)` returns.
 */
function createAutoCorrectRule(
  find: InputRuleFinder,
  getReplacement: (match: ExtendedRegExpMatchArray) => string,
  isEnabled: () => boolean,
  insideAddress?: (textBefore: string) => boolean,
): InputRule {
  return new InputRule({
    find,
    handler: ({ state, range, match }) => {
      if (!isEnabled()) return null;
      // An address being typed keeps its "--", "...", "(c)", "1/2" and
      // straight quotes, and is then linked whole (WUA 057).
      if (insideAddress?.(match.input ?? "")) return null;
      const replacement = getReplacement(match);
      // No-op guard: if the matched text already equals the replacement, do
      // nothing so we never dispatch an empty/no-change transaction.
      if (replacement === match[0]) return null;
      // Rewrite only what changes. The context a rule matches to decide (the
      // letter before a quote, before "--") is re-emitted unchanged, and
      // inserting it again with the typing marks took its own formatting: a
      
      // Typing over a selection: `range` runs to the selection's end, so the
      // selected text is in it but not in the match. Counting it keeps the
      // context unchanged there too, and the new quote then takes the
      
      // B after a bold A came back as a bold A’).
      let keep = 0;
      const selected = state.selection.to - state.selection.from;
      const typedLength = match[0].length - (range.to - range.from) + selected;
      if (typedLength === 1) {
        while (
          keep < replacement.length &&
          keep < match[0].length - 1 &&
          replacement[keep] === match[0][keep]
        ) {
          keep += 1;
        }
      }
      state.tr.insertText(replacement.slice(keep), range.from + keep, range.to);
      return undefined;
    },
  });
}

/**
 * Contextual smart-quote rule for one quote kind. The `find` captures the
 * (optional) character before the straight quote so the handler can pick the
 * opening vs closing glyph; the replacement re-emits that preceding char
 * followed by the resolved curly quote.
 */
function createSmartQuoteRule(
  kind: QuoteKind,
  straight: '"' | "'",
  isEnabled: () => boolean,
): InputRule {
  // "Straight quotes" with "smart quotes" (AutoFormat As You Type).
  // Group 1 = the (optional) char before the quote; the quote is the final char.
  const find = new RegExp(`(.?)\\${straight}$`);
  return createAutoCorrectRule(
    find,
    (match) => {
      const precedingChar = match[1] ?? "";
      return precedingChar + resolveSmartQuote(kind, precedingChar);
    },
    isEnabled,
    (textBefore) => quoteTypedInsideAddress(textBefore.slice(0, -1), kind),
  );
}

/**
 * Word's spaced hyphens → en dash, once the word after them ends. Only the
 * hyphens change: the words around them, the following word in particular,
 * are typed text with their own formatting and stay as they are. Backspace
 * right after it gives the hyphens back (TipTap's undoInputRule), as Word's
 * Undo does.
 */
function createEnDashRule(isEnabled: () => boolean): InputRule {
  return new InputRule({
    find: EN_DASH_FIND,
    handler: ({ state, range, match }) => {
      if (!isEnabled()) return null;
      const whole = match[0];
      const hyphensFrom = match[1].length + 1;
      const hyphensTo = hyphensFrom + match[2].length;
      // The typed text is the end of the match; it is not in the document yet.
      const selected = state.selection.to - state.selection.from;
      const typedFrom = range.to - range.from - selected;
      if (typedFrom < hyphensTo || typedFrom >= whole.length) {
        state.tr.insertText(
          whole.slice(0, hyphensFrom) + EN_DASH + whole.slice(hyphensTo),
          range.from,
          range.to,
        );
        return undefined;
      }
      // The later edit first, so the hyphens' positions still hold.
      state.tr.insertText(whole.slice(typedFrom), range.from + typedFrom, range.to);
      state.tr.insertText(EN_DASH, range.from + hyphensFrom, range.from + hyphensTo);
      return undefined;
    },
  });
}

/** The option each built-in typography rule belongs to; the rest are list
 * entries. */
const TYPOGRAPHY_OPTION: Record<string, keyof AutoCorrectSettings | undefined> = {
  "em-dash": "hyphensWithDash",
  "frac-half": "fractions",
  "frac-quarter": "fractions",
  "frac-three-quarters": "fractions",
};

/**
 * Word's *Bold* and _italic_ with real formatting: the closing marker typed
 * after the text removes both markers and formats the text between them;
 * what is typed next is not bold.
 */
function createBoldItalicRule(isEnabled: () => boolean): InputRule {
  return new InputRule({
    find: BOLD_ITALIC_FIND,
    handler: ({ state, range, match }) => {
      if (!isEnabled()) return null;
      const marker = match[2] ?? "";
      const content = match[3] ?? "";
      const markType = state.schema.marks[marker === "*" ? "bold" : "italic"];
      if (!markType) return null;
      const openFrom = range.from + (match[1]?.length ?? 0);
      const typedAt = range.from + match[0].length - 1;
      // An object inside the text (a field, a picture) keeps it as typed.
      if (state.doc.textBetween(openFrom, typedAt) !== marker + content) return null;
      const { tr } = state;
      if (range.to > typedAt) tr.delete(typedAt, range.to);
      tr.delete(openFrom, openFrom + 1);
      tr.addMark(openFrom, openFrom + content.length, markType.create({ value: true }));
      tr.removeStoredMark(markType);
      return undefined;
    },
  });
}

function inTableCell(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name;
    if (name === "tableCell" || name === "tableHeader") return true;
  }
  return false;
}

/**
 * When a word ends (a space or punctuation typed after it): the replacement
 * list's word entries, TWo INitial CApitals, cAPS LOCK, names of days, the
 * first letter of a sentence or a table cell, and an ordinal's superscript
 * suffix -- each as its box in AutoCorrect Options says.
 */
function createWordEndRule(isEnabled: () => boolean): InputRule {
  return new InputRule({
    find: (text) => {
      if (!isEnabled()) return null;
      const trigger = text.slice(-1);
      if (!WORD_END_TRIGGER.test(trigger)) return null;
      const before = text.slice(0, -1);
      if (typedTextEndsInsideAddress(text)) return null;
      const settings = getAutoCorrectSettings();
      const found =
        correctEndedWord(before, { ...settings, inTableCell: false, endedBySpace: /\s/u.test(trigger) }) ??
        correctEndedWord(before, { ...settings, inTableCell: true, endedBySpace: /\s/u.test(trigger) });
      return found
        ? { index: before.length - found.typed.length, text: found.typed + trigger, data: { before, trigger } }
        : null;
    },
    handler: ({ state, range, match }) => {
      const data = match.data as { before: string; trigger: string } | undefined;
      if (!data || !isEnabled()) return null;
      const correction = correctEndedWord(data.before, {
        ...getAutoCorrectSettings(),
        inTableCell: inTableCell(state, range.from),
        endedBySpace: /\s/u.test(data.trigger),
      });
      if (!correction) return null;
      const wordFrom = range.from;
      const wordTo = wordFrom + correction.typed.length;
      if (state.doc.textBetween(wordFrom, wordTo) !== correction.typed) return null;
      const { tr } = state;
      // The trigger goes in as typed, over any selection.
      tr.insertText(data.trigger, wordTo, range.to);
      const { typed, replacement } = correction;
      if (replacement !== typed) {
        if (replacement.length === typed.length) {
          // A change of case: only the letters that change, each keeping
          // its own formatting.
          for (let index = 0; index < typed.length; index += 1) {
            if (typed[index] !== replacement[index]) {
              tr.insertText(replacement[index]!, wordFrom + index, wordFrom + index + 1);
            }
          }
        } else {
          tr.insertText(replacement, wordFrom, wordTo);
        }
      }
      const superscript = state.schema.marks.superscript;
      if (correction.superscriptFrom !== undefined && superscript) {
        tr.addMark(wordFrom + correction.superscriptFrom, wordFrom + replacement.length, superscript.create());
      }
      return undefined;
    },
  });
}

export const AutoCorrect = Extension.create<AutoCorrectOptions>({
  name: "autoCorrect",

  addOptions() {
    return {
      isEnabled: () => true,
    };
  },

  addInputRules() {
    const isEnabled = () => this.options.isEnabled();
    // Each rule also asks for its own box of Word's AutoCorrect Options.
    const when = (option: keyof AutoCorrectSettings) => () =>
      isEnabled() && getAutoCorrectSettings()[option] === true;
    return [
      // Contextual smart quotes first.
      createSmartQuoteRule("double", '"', when("smartQuotes")),
      createSmartQuoteRule("single", "'", when("smartQuotes")),
      // The replacement list's symbol entries: "(c)", "...", ":)", "-->".
      createAutoCorrectRule(
        (text) => {
          const settings = getAutoCorrectSettings();
          if (!settings.replaceText) return null;
          const found = matchSymbolEntry(text, settings.entries);
          return found
            ? { index: text.length - found.typed.length, text: found.typed, data: { replacement: found.replacement } }
            : null;
        },
        (match) => String((match.data as { replacement?: unknown } | undefined)?.replacement ?? match[0]),
        when("replaceText"),
        typedTextEndsInsideAddress,
      ),
      // Context-free swaps (em-dash, fractions). Each rule's pure `replace`
      // string may carry `$1`/`$2` back-references against its `find`; we
      // expand them here (TipTap's textInputRule would not). The symbols
      // and the ellipsis are entries of the list above.
      ...TEXT_TYPOGRAPHY_RULES.filter((rule) => TYPOGRAPHY_OPTION[rule.id]).map((rule) =>
        createAutoCorrectRule(
          rule.find,
          (match) => expandBackrefs(rule.replace, match),
          when(TYPOGRAPHY_OPTION[rule.id]!),
          typedTextEndsInsideAddress,
        ),
      ),
      createEnDashRule(when("hyphensWithDash")),
      createBoldItalicRule(when("boldItalic")),
      createWordEndRule(isEnabled),
    ];
  },
});

/**
 * Expand `$0`/`$1`/`$2`… back-references in a replacement template against a
 * regex match — the same `$n` semantics as `String.prototype.replace`, but
 * applied to an already-computed match so it works inside an input-rule handler.
 * An out-of-range or absent group expands to the empty string.
 */
export function expandBackrefs(
  template: string,
  match: RegExpMatchArray,
): string {
  return template.replace(/\$(\d+)/g, (_whole, digits: string) => {
    const index = Number.parseInt(digits, 10);
    return match[index] ?? "";
  });
}

export default AutoCorrect;
