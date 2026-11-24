// Finding a trigger like "@" or "/" before the caret, and remembering matches
// a user dismissed. Pure: plain text in, plain data out, so every rule here is
// unit tested.
import type { TextRange } from "../../foundation/text/text-editor"

/**
 * Where a match may start. `"start"`: offset 0 only, so a leading space escapes it. `"line"`: the
 * start of a line. `"word"`: the start, whitespace, an opening bracket or quote, or right after a
 * token. `"anywhere"`: mid-word too.
 * @stable
 */
type TriggerBoundary = "start" | "line" | "word" | "anywhere"

/**
 * How a trigger matches.
 * @stable
 */
type TriggerRule = {
  /** The text that starts a match: `"@"`, `"/"`, `"#"`, or several characters like `"[["`. */
  char: string
  /**
   * Where a match may start.
   * @defaultValue "word"
   */
  boundary?: TriggerBoundary
  /**
   * Whether the query may contain spaces, or up to how many words, like `@next Wednesday`.
   * @defaultValue false
   */
  spaces?: boolean | number
  /**
   * Characters a query may contain, tested one at a time.
   * @defaultValue /[\p{L}\p{N}\p{M}_\-.]/u
   */
  pattern?: RegExp
  /**
   * The longest query before the match ends.
   * @defaultValue 50
   */
  maxLength?: number
}

/**
 * A trigger and the text after it, up to the caret.
 * @stable
 */
type TriggerMatch = {
  /** The trigger's text, like `"@"`. */
  trigger: string
  /** Where the trigger starts. */
  start: number
  /** The caret: where the query ends. */
  end: number
  /** The text between the trigger and the caret. */
  query: string
}

/** A match a user dismissed with Escape, which edits move along. */
type DismissedMatch = TextRange & { trigger: string }

const defaultPattern = /[\p{L}\p{N}\p{M}_\-.]/u
const defaultMaxLength = 50

// Full-width forms an input method commits, like a Japanese keyboard's ＠.
// Each is one UTF-16 unit, like its ASCII form, so offsets don't move.
const fullWidth: Record<string, string> = {
  "＠": "@",
  "＃": "#",
  "／": "/",
  "＋": "+",
  "：": ":",
  "［": "[",
}
const fullWidthPattern = /[＠＃／＋：［]/g

function normalizeTriggerText(text: string) {
  return text.replace(fullWidthPattern, (char) => fullWidth[char])
}

// Characters after which a "word" trigger may start: brackets and quotes that
// open a phrase, and a token, which reads as U+FFFC.
const openers = new Set(["(", "[", "{", '"', "'", "\uFFFC"])

// A copy without the global or sticky flag, so testing one character never
// depends on the last test's position.
const stateless = new WeakMap<RegExp, RegExp>()
function characterPattern(pattern: RegExp) {
  if (!pattern.global && !pattern.sticky) {
    return pattern
  }
  let copy = stateless.get(pattern)
  if (!copy) {
    stateless.set(
      pattern,
      (copy = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, "")))
    )
  }
  return copy
}

// Whether text after a trigger is a query it accepts.
function isValidQuery(query: string, rule: TriggerRule) {
  if (query.length > (rule.maxLength ?? defaultMaxLength)) {
    return false
  }
  // A trigger followed by whitespace is just text, like "@ home".
  if (/^\s/.test(query) || query.includes("\n")) {
    return false
  }
  const pattern = characterPattern(rule.pattern ?? defaultPattern)
  const spaces = rule.spaces ?? false
  let words = 1
  let previous = ""
  for (const char of query) {
    if (char === " ") {
      // Two spaces in a row end a phrase.
      if (!spaces || previous === " ") {
        return false
      }
      words++
    } else if (!pattern.test(char)) {
      return false
    }
    previous = char
  }
  return (
    typeof spaces !== "number" || words - (previous === " " ? 1 : 0) <= spaces
  )
}

// Whether a trigger at `index` of `text`, which starts at `offset`, is where its boundary allows.
function isAtBoundary(
  text: string,
  index: number,
  offset: number,
  boundary: TriggerBoundary
) {
  const absolute = offset + index
  if (boundary === "anywhere" || absolute === 0) {
    return true
  }
  if (boundary === "start") {
    return false
  }
  // The character before is outside the text: callers read one extra, so this means unknown.
  if (index === 0) {
    return false
  }
  const before = text[index - 1]
  if (boundary === "line") {
    return before === "\n"
  }
  return /\s/.test(before) || openers.has(before)
}

// How many characters before the caret matching needs: the longest query and
// trigger, plus one for the character a boundary checks.
function lookBehind(rules: readonly TriggerRule[]) {
  let longest = 0
  for (const rule of rules) {
    longest = Math.max(
      longest,
      (rule.maxLength ?? defaultMaxLength) + rule.char.length
    )
  }
  return longest + 1
}

/**
 * The trigger match that ends at the caret, if any. `text` is what comes before
 * the caret and `offset` where it starts. Scans back from the caret, so the
 * nearest trigger wins, and stops at the first character no query may contain.
 */
function findTriggerMatch(
  text: string,
  offset: number,
  rules: readonly TriggerRule[]
) {
  if (!rules.length) {
    return null
  }
  const source = normalizeTriggerText(text)
  const caret = source.length
  const limit = lookBehind(rules)
  for (let index = caret - 1; index >= 0 && caret - index <= limit; index--) {
    for (let rule = 0; rule < rules.length; rule++) {
      const { char, boundary = "word" } = rules[rule]
      if (!char || !source.startsWith(char, index)) {
        continue
      }
      const query = text.slice(index + char.length)
      if (
        isValidQuery(normalizeTriggerText(query), rules[rule]) &&
        isAtBoundary(source, index, offset, boundary)
      ) {
        return {
          rule,
          match: {
            trigger: char,
            start: offset + index,
            end: offset + caret,
            query,
          },
        }
      }
    }
    const char = source[index]
    const continues = rules.some(
      (rule) =>
        rule.char.includes(char) ||
        (char === " " && !!rule.spaces) ||
        characterPattern(rule.pattern ?? defaultPattern).test(char)
    )
    if (!continues) {
      break
    }
  }
  return null
}

/**
 * Moves a dismissed match along with an edit that replaced `range` with
 * `inserted` characters. Edits before it shift it, edits inside or at its end
 * grow or shrink it, and an edit that touches the trigger itself clears it:
 * the trigger was deleted or retyped. Caret moves and other edits leave it.
 */
function mapDismissed(
  dismissed: DismissedMatch,
  range: TextRange,
  inserted: number
) {
  const delta = inserted - (range.end - range.start)
  const triggerEnd = dismissed.start + dismissed.trigger.length
  if (range.end <= dismissed.start) {
    return {
      ...dismissed,
      start: dismissed.start + delta,
      end: dismissed.end + delta,
    }
  }
  if (range.start < triggerEnd) {
    return null
  }
  if (range.start <= dismissed.end) {
    return { ...dismissed, end: Math.max(triggerEnd, dismissed.end + delta) }
  }
  return dismissed
}

export {
  type DismissedMatch,
  findTriggerMatch,
  isAtBoundary,
  isValidQuery,
  lookBehind,
  mapDismissed,
  normalizeTriggerText,
  type TriggerBoundary,
  type TriggerMatch,
  type TriggerRule,
}
