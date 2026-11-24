// The options a state key names: `on<Key>Change`, `on<Key>Commit` and
// `default<Key>`, for a key like `value`.

const capitalized = (key: string) => `${key[0].toUpperCase()}${key.slice(1)}`

/** The callback that hears a key change or commit, like `onValueChange` for `"value"`. */
const callbackName = (key: string, kind: "Change" | "Commit") =>
  `on${capitalized(key)}${kind}`

/** The option an uncontrolled key starts from, like `defaultValue` for `"value"`. */
const defaultName = (key: string) => `default${capitalized(key)}`

export { callbackName, defaultName }
