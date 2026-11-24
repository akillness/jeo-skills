// The pure side of OTP Input: which characters a code accepts, what a paste
// becomes, where the selection goes so the slot under the caret is selected,
// and the slots rendered from the value and the selection. No DOM, so the
// tests use it directly. Positions count UTF-16 units, like the
// input's own selection, since codes are made of single-unit characters.

/**
 * Which characters a code accepts: `"digits"`, `"letters"`, `"alphanumeric"`,
 * or a regular expression that each character must match, like `/[A-F0-9]/i`.
 * @stable
 */
type OTPInputPattern = "digits" | "letters" | "alphanumeric" | RegExp

/**
 * One slot of the code, rendered from the value and the selection.
 * @stable
 */
type OTPInputSlotData = {
  /** The character in the slot, or null when it's empty. */
  char: string | null
  /** Whether the slot is where typing goes: the selected character, or the empty slot after the last one. */
  active: boolean
  /** Whether the slot should draw a caret: it's active and empty. The real caret is hidden. */
  hasFakeCaret: boolean
}

type Selection = { start: number; end: number }

const presets = {
  digits: /^[0-9]$/,
  letters: /^[A-Za-z]$/,
  alphanumeric: /^[A-Za-z0-9]$/,
}

const anchored = new WeakMap<RegExp, RegExp>()

// A character-sized copy of a custom pattern: anchored, and without `g` or
// `y`, whose `lastIndex` would make repeated tests disagree.
function characterPattern(pattern: OTPInputPattern) {
  if (typeof pattern === "string") {
    return presets[pattern]
  }
  let regexp = anchored.get(pattern)
  if (!regexp) {
    regexp = new RegExp(
      `^(?:${pattern.source})$`,
      pattern.flags.replace(/[gy]/g, "")
    )
    anchored.set(pattern, regexp)
  }
  return regexp
}

/** Whether every character of `text` fits the pattern. */
function fitsPattern(text: string, pattern: OTPInputPattern) {
  const regexp = characterPattern(pattern)
  return Array.from(text).every((char) => regexp.test(char))
}

/** Whether a whole value is a code the input can hold: no longer than `maxLength`, every character allowed. */
function isValidCode(
  value: string,
  pattern: OTPInputPattern,
  maxLength: number
) {
  return value.length <= maxLength && fitsPattern(value, pattern)
}

/** The keyboard a pattern asks for on touch screens. */
function inputModeFor(pattern: OTPInputPattern) {
  return pattern === "digits" ? "numeric" : "text"
}

// The native `pattern` attribute, so constraint validation agrees with the
// presets and blocks a partial code. `minlength` alone only flags codes the
// user typed, not a partial default or a controller's write, so the pattern
// asks for the length too, except while the browser already flags the code
// as too short: browsers report a mismatched format before a short one, and
// the user would read "match the requested format" instead of how long the
// code is. Custom expressions may not compile under the attribute's `v` flag,
// so they only set the length.
function patternAttribute(
  pattern: OTPInputPattern,
  length: number,
  tooShort: boolean
) {
  const count = tooShort ? "*" : `{${length}}`
  if (pattern === "digits") {
    return `[0-9]${count}`
  }
  if (pattern === "letters") {
    return `[A-Za-z]${count}`
  }
  if (pattern === "alphanumeric") {
    return `[A-Za-z0-9]${count}`
  }
  return tooShort ? undefined : `.{${length}}`
}

/**
 * What inserted text becomes. Full-width characters from an input method,
 * like "１２３", become their plain forms, and so do another script's digits,
 * like "٤٨٢", unless the pattern takes them as they are. Codes are often written "123 456"
 * or "123-456", so spaces and dashes go. Null when anything else doesn't fit
 * the pattern, like "Your code is 123456", which is ignored rather than half
 * pasted.
 */
function pastedCode(text: string, pattern: OTPInputPattern) {
  const code = text.normalize("NFKC").replace(/[\s\u00A0\-\u2010-\u2015]/g, "")
  if (!code) {
    return null
  }
  if (fitsPattern(code, pattern)) {
    return code
  }
  const plain = plainDigits(code)
  return fitsPattern(plain, pattern) ? plain : null
}

const decimalDigit = /\p{Nd}/u

// Every script's digits, like Arabic-Indic "٤" or Persian "۴", run in order
// from zero, some runs side by side, so a digit's value is its place in its run.
function plainDigits(text: string) {
  return text.replace(/\p{Nd}/gu, (digit) => {
    const code = digit.codePointAt(0)!
    let start = code
    while (decimalDigit.test(String.fromCodePoint(start - 1))) {
      start--
    }
    return String((code - start) % 10)
  })
}

/**
 * The value after inserting text over a selection, cut to `maxLength`. A
 * whole code replaces everything, wherever the caret was.
 */
function insertCode(
  value: string,
  selection: Selection,
  text: string,
  maxLength: number
) {
  if (text.length >= maxLength) {
    return text.slice(0, maxLength)
  }
  return (
    value.slice(0, selection.start) +
    text +
    value.slice(selection.end)
  ).slice(0, maxLength)
}

/**
 * Where the selection goes after the caret moves, so the slot under the caret
 * is selected and typing replaces it. A caret after the last character, in a
 * code that isn't full, stays: the next character goes there. `previous` is
 * the selection before the move, which says whether an arrow key went back.
 * Returns null when the selection should stay as it is.
 */
function slotSelection(
  selection: Selection,
  previous: Selection | null,
  length: number,
  maxLength: number
) {
  const caret = selection.start
  if (selection.start !== selection.end || length === 0) {
    return null
  }
  if (caret === length && length < maxLength) {
    return null
  }
  if (caret >= maxLength) {
    return {
      start: maxLength - 1,
      end: maxLength,
      direction: "backward" as const,
    }
  }
  if (caret === 0) {
    return { start: 0, end: 1, direction: "forward" as const }
  }
  const backward = !!previous && caret < previous.end
  // From a selected slot, ArrowLeft collapses to that slot's start, which is
  // one slot back. From the empty slot at the end, it's the last character.
  const wasInserting =
    !!previous && previous.start === previous.end && previous.start < maxLength
  const index = backward && !wasInserting ? caret - 1 : caret
  return {
    start: index,
    end: index + 1,
    direction: backward ? ("backward" as const) : ("forward" as const),
  }
}

/** Where the selection starts on focus: the empty slot after the code, or its last character when it's full. */
function focusSelection(length: number, maxLength: number) {
  return length >= maxLength
    ? { start: maxLength - 1, end: maxLength }
    : { start: length, end: length }
}

/** The selection a press on slot `index` makes: that character, or the empty slot after the code. */
function pressSelection(index: number, length: number, maxLength: number) {
  if (index >= length) {
    return focusSelection(length, maxLength)
  }
  return { start: index, end: index + 1 }
}

/**
 * Where an arrow key, Home or End moves the selection, a slot at a time: onto
 * the character before or after, or the empty slot after the code. Null for
 * any other key. Right to left, the arrows swap.
 */
function keySelection(
  key: string,
  selection: Selection,
  length: number,
  maxLength: number,
  rtl = false
) {
  const forward = rtl ? "ArrowLeft" : "ArrowRight"
  const backward = rtl ? "ArrowRight" : "ArrowLeft"
  const end = focusSelection(length, maxLength)
  if (key === "Home") {
    return length ? { start: 0, end: 1 } : end
  }
  if (key === "End") {
    return end
  }
  if (key === backward) {
    const index = Math.max(
      0,
      selection.start -
        (selection.start === selection.end ||
        selection.end - selection.start === 1
          ? 1
          : 0)
    )
    return length ? { start: index, end: index + 1 } : end
  }
  if (key === forward) {
    const index =
      selection.start === selection.end ? selection.start : selection.start + 1
    return index < length ? { start: index, end: index + 1 } : end
  }
  return null
}

/** The slots rendered from the value, and the selection while focused. */
function slotsOf(
  value: string,
  maxLength: number,
  selection: Selection | null
) {
  const slots: OTPInputSlotData[] = []
  for (let index = 0; index < maxLength; index++) {
    const char = value[index] ?? null
    const active =
      !!selection &&
      (selection.start === selection.end
        ? index === selection.start
        : index >= selection.start && index < selection.end)
    slots.push({ char, active, hasFakeCaret: active && char === null })
  }
  return slots
}

export {
  fitsPattern,
  focusSelection,
  inputModeFor,
  insertCode,
  isValidCode,
  keySelection,
  type OTPInputPattern,
  type OTPInputSlotData,
  pastedCode,
  patternAttribute,
  pressSelection,
  type Selection,
  slotSelection,
  slotsOf,
}
