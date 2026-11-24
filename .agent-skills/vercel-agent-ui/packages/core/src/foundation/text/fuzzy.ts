// A small fuzzy scorer for filtering and ranking a list as the user types,
// like a command palette's. It ignores case and accents the way the user's
// language does, and prefers, in
// order: the whole text, a prefix, a word that starts with the query, any
// substring, then the query's letters in order with bonuses for word starts
// and runs, so "gp" finds "Git push". Scores run from 0, no match, to 1.
import { normalize } from "./typeahead"
import { startsWord } from "./match"

// How much of the text the query covers, as a small bonus that ranks "Set"
// above "Settings" for "set".
const coverage = (needle: string, haystack: string) =>
  (0.09 * needle.length) / haystack.length

// Where the query appears at the start of a word, or -1.
function wordStartIndex(haystack: string, needle: string, from: number) {
  for (
    let index = from;
    index !== -1;
    index = haystack.indexOf(needle, index + 1)
  ) {
    if (startsWord(haystack, index)) {
      return index
    }
  }
  return -1
}

// The query's letters in order, anywhere in the text. Spaces in the query
// only separate words, so "git ps" finds "git push". Each letter scores more
// at the start of a word or right after the previous one.
function subsequenceScore(haystack: string, needle: string) {
  let position = 0
  let previous = -2
  let bonus = 0
  let letters = 0
  for (const char of needle) {
    if (char === " ") {
      continue
    }
    const found = haystack.indexOf(char, position)
    if (found === -1) {
      return 0
    }
    letters++
    if (startsWord(haystack, found)) {
      bonus += 1
    }
    if (found === previous + 1) {
      bonus += 1
    }
    previous = found
    position = found + 1
  }
  if (!letters) {
    return 0
  }
  return 0.1 + (0.4 * bonus) / (2 * letters)
}

/**
 * How well `text` matches `query`, from 0 (no match) to 1 (the same text), ignoring case and accents.
 * @stable
 */
function fuzzyScore(text: string, query: string) {
  const needle = normalize(query)
  if (!needle) {
    return 1
  }
  const haystack = normalize(text)
  if (haystack === needle) {
    return 1
  }
  const index = haystack.indexOf(needle)
  if (index === 0) {
    return 0.9 + coverage(needle, haystack)
  }
  if (index > 0) {
    return (
      (wordStartIndex(haystack, needle, index) !== -1 ? 0.75 : 0.6) +
      coverage(needle, haystack)
    )
  }
  return subsequenceScore(haystack, needle)
}

/**
 * A filter that keeps items with the query's letters in order, scored by
 * `fuzzyScore` over the label and keywords. Keywords count a little less than
 * the label, so a label match wins a tie.
 */
function fuzzyFilter(
  item: { label: string; keywords?: string[] },
  query: string
) {
  let best = fuzzyScore(item.label, query)
  for (const keyword of item.keywords ?? []) {
    best = Math.max(best, fuzzyScore(keyword, query) * 0.95)
  }
  return best
}

export { fuzzyFilter, fuzzyScore }
