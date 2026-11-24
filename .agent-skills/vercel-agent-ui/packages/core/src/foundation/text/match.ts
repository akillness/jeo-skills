// How text matches what the user typed, in their language: case and accents
// don't count where their language says they don't, through `Intl.Collator`
// at base sensitivity. Folding keeps every character in place, one UTF-16
// unit for one, so a match in the folded text is the same range in the label,
// which is what match highlighting marks. Pure, so it's unit tested without a DOM.
import { userLocale } from "./locale"

/**
 * A matched part of a text, from `start` up to `end`, like `slice`.
 * @stable
 */
type MatchRange = { start: number; end: number }

/**
 * A piece of an item's text, and whether it matched what was typed.
 * @stable
 */
type MatchSegment = { text: string; match: boolean }

// Letters NFD can't take apart, like ø or ł, are tried against these.
const latinLetters = "abcdefghijklmnopqrstuvwxyz"
const diacritics = /\p{Diacritic}/gu
const latin = /\p{Script=Latin}/u
const ascii = /^[\u0000-\u007f]*$/

// Locales whose lowercase differs from the default, like Turkish dotless i.
const specialCase = /^(tr|az|lt)\b/i

/**
 * Folds text for matching in one locale: `fold("Łódź")` is `"lodz"` in
 * English, while Swedish keeps `"ä"` apart from `"a"`. The result has the
 * text's length, so indexes into it are indexes into the text.
 */
function createFolder(locale?: string) {
  const collator = new Intl.Collator(locale, {
    sensitivity: "base",
    usage: "search",
  })
  const lower = specialCase.test(locale ?? "")
    ? (text: string) => text.toLocaleLowerCase(locale)
    : (text: string) => text.toLowerCase()
  const chars = new Map<string, string>()
  const texts = new Map<string, string>()

  // One character's folded form, the same length, decided once by the collator.
  function foldChar(char: string) {
    let folded = chars.get(char)
    if (folded !== undefined) {
      return folded
    }
    const lowered = lower(char)
    if (char < "\u0080") {
      chars.set(char, lowered)
      return lowered
    }
    const stripped = lower(char.normalize("NFD").replace(diacritics, ""))
    if (
      stripped.length === char.length &&
      stripped !== lowered &&
      collator.compare(char, stripped) === 0
    ) {
      folded = stripped
    } else if (latin.test(char)) {
      folded = [...latinLetters].find(
        (letter) => collator.compare(char, letter) === 0
      )
    }
    folded ??= lowered.length === char.length ? lowered : char
    chars.set(char, folded)
    return folded
  }

  function fold(text: string) {
    let folded = texts.get(text)
    if (folded !== undefined) {
      return folded
    }
    if (ascii.test(text)) {
      folded = lower(text)
    } else {
      folded = ""
      for (const char of text) {
        folded += foldChar(char)
      }
    }
    // Bounded, so labels that come and go can't grow it forever.
    if (texts.size > 50_000) {
      texts.clear()
    }
    texts.set(text, folded)
    return folded
  }

  return { locale, fold }
}

type Folder = ReturnType<typeof createFolder>

let folder: Folder | undefined
let watching = false

/** Matches text in another locale than the user's, or in the user's again without one. */
function setMatchLocale(locale?: string) {
  folder = createFolder(locale ?? userLocale())
}

function userFolder() {
  if (folder) {
    return folder
  }
  // The user can switch languages while the page is open.
  if (!watching && typeof window !== "undefined") {
    watching = true
    window.addEventListener("languagechange", () => (folder = undefined))
  }
  return (folder = createFolder(userLocale()))
}

/** Text folded for matching in the user's language: case and accents that don't count there are gone. */
const foldText = (text: string) => userFolder().fold(text)

// How many spaces and line breaks a text starts with, so "startsWith" skips
// the indentation a label's markup may carry.
function leadingSpaces(text: string) {
  let index = 0
  while (index < text.length && text.charCodeAt(index) <= 32) {
    index++
  }
  return index
}

// Characters that end a word, so the one after them starts the next.
const separators = new Set([
  " ",
  "-",
  "_",
  "/",
  ".",
  ":",
  ",",
  "(",
  ")",
  "[",
  "]",
  "@",
  "#",
])

// Whether a word starts at an index, after a separator or at the start.
const startsWord = (text: string, index: number) =>
  index === 0 || separators.has(text[index - 1])

/**
 * The ranges of `text` that `query` matched, the way a filter matches:
 * `"contains"` the first place it appears, `"startsWith"` the start, and
 * `"fuzzy"` a whole match where there is one, else each letter in order.
 * Empty when nothing matched, like when only a keyword did.
 * @stable
 */
function matchRanges(
  text: string,
  query: string,
  mode: "contains" | "startsWith" | "fuzzy"
) {
  const needle = foldText(query.trim())
  if (!needle) {
    return []
  }
  const haystack = foldText(text)
  const index = haystack.indexOf(needle)
  if (mode === "startsWith") {
    const start = leadingSpaces(haystack)
    return haystack.startsWith(needle, start)
      ? [{ start, end: start + needle.length }]
      : []
  }
  if (index !== -1) {
    // Fuzzy matching prefers a word start, like "push" in "Git push".
    const start = mode === "fuzzy" ? wordStart(haystack, needle, index) : index
    return [{ start, end: start + needle.length }]
  }
  return mode === "fuzzy" ? letterRanges(haystack, needle) : []
}

function wordStart(haystack: string, needle: string, first: number) {
  for (
    let index = first;
    index !== -1;
    index = haystack.indexOf(needle, index + 1)
  ) {
    if (startsWord(haystack, index)) {
      return index
    }
  }
  return first
}

// The query's letters in order, as ranges with neighbours joined. Spaces in
// the query only separate words.
function letterRanges(haystack: string, needle: string) {
  const ranges: MatchRange[] = []
  let position = 0
  for (const char of needle) {
    if (char === " ") {
      continue
    }
    const found = haystack.indexOf(char, position)
    if (found === -1) {
      return []
    }
    const last = ranges.at(-1)
    if (last && last.end === found) {
      last.end = found + 1
    } else {
      ranges.push({ start: found, end: found + 1 })
    }
    position = found + 1
  }
  return ranges
}

/**
 * Text split into the parts a query matched and the parts it didn't, in order.
 * @stable
 */
function matchSegments(text: string, ranges: MatchRange[]) {
  if (!ranges.length) {
    return [{ text, match: false }]
  }
  const segments: MatchSegment[] = []
  let position = 0
  for (const { start, end } of ranges) {
    if (start > position) {
      segments.push({ text: text.slice(position, start), match: false })
    }
    segments.push({ text: text.slice(start, end), match: true })
    position = end
  }
  if (position < text.length) {
    segments.push({ text: text.slice(position), match: false })
  }
  return segments
}

export {
  createFolder,
  foldText,
  leadingSpaces,
  type MatchRange,
  matchRanges,
  type MatchSegment,
  matchSegments,
  setMatchLocale,
  startsWord,
}
