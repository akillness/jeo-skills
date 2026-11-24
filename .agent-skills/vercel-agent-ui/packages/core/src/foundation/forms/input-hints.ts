// What a field offers as someone types: a phone's keys and Return key, autofill,
// and corrections. Spelled as React spells them, which HTML takes in any case.

/**
 * What a phone labels the Return key, through `enterkeyhint`.
 * @experimental
 */
type EnterKeyHint =
  "enter" | "done" | "go" | "next" | "previous" | "search" | "send"

/**
 * The kinds of field `inputHints` knows.
 * @experimental
 */
type InputHintKind =
  | "search"
  | "email"
  | "tel"
  | "url"
  | "one-time-code"
  | "numeric"
  | "decimal"
  | "name"
  | "username"
  | "current-password"
  | "new-password"
  | "postal-code"
  | "message"

/**
 * The attributes `inputHints` returns, spelled as React spells them. HTML
 * reads attribute names in any case, so they work in every framework.
 * @experimental
 */
type InputHints = {
  inputMode?: "search" | "email" | "tel" | "url" | "numeric" | "decimal"
  enterKeyHint?: EnterKeyHint
  autoComplete?: string
  autoCapitalize?: "none" | "sentences" | "words" | "characters"
  autoCorrect?: "on" | "off"
  spellCheck?: "true" | "false"
}

/**
 * Options for `inputHints`.
 * @experimental
 */
type InputHintOptions = {
  /** What the Return key says, like `"next"` for a field with more after it. Replaces the kind's own. */
  enter?: EnterKeyHint
}

// Typed exactly as it's meant, like an address or a code: no capitals, corrections or spelling marks.
const exact = {
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: "false",
} as const

const kinds: Record<InputHintKind, InputHints> = {
  search: {
    inputMode: "search",
    enterKeyHint: "search",
    autoComplete: "off",
    autoCapitalize: "none",
    spellCheck: "false",
  },
  email: { inputMode: "email", autoComplete: "email", ...exact },
  tel: { inputMode: "tel", autoComplete: "tel" },
  url: { inputMode: "url", autoComplete: "url", ...exact },
  "one-time-code": {
    inputMode: "numeric",
    autoComplete: "one-time-code",
    ...exact,
  },
  numeric: { inputMode: "numeric", autoComplete: "off" },
  decimal: { inputMode: "decimal", autoComplete: "off" },
  name: {
    autoComplete: "name",
    autoCapitalize: "words",
    autoCorrect: "off",
    spellCheck: "false",
  },
  username: { autoComplete: "username", ...exact },
  "current-password": { autoComplete: "current-password", ...exact },
  "new-password": { autoComplete: "new-password", ...exact },
  "postal-code": {
    autoComplete: "postal-code",
    autoCapitalize: "characters",
    autoCorrect: "off",
    spellCheck: "false",
  },
  message: {
    enterKeyHint: "send",
    autoComplete: "off",
    autoCapitalize: "sentences",
    autoCorrect: "on",
    spellCheck: "true",
  },
}

/**
 * The attributes that suit a field of `kind`: a phone's keys and Return key,
 * autofill, and capitals, corrections and spelling. Spread them on an
 * `<input>` or `<textarea>` in any framework. Your own attributes after them win.
 * @experimental
 */
function inputHints(kind: InputHintKind, options: InputHintOptions = {}) {
  const hints: InputHints = { ...kinds[kind] }
  if (options.enter) {
    hints.enterKeyHint = options.enter
  }
  return hints
}

export {
  type EnterKeyHint,
  type InputHintKind,
  type InputHintOptions,
  type InputHints,
  inputHints,
}
