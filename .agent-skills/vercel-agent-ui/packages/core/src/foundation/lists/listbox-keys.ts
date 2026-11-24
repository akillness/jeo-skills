// Keys and element ids of a list's built-in options, like a select-all
// option, apart from the options themselves, so a list that only checks for
// one doesn't ship it.
import { idPart } from "../kernel/attrs"

// Select-all keys in the highlight. Never a real item's.
const SELECT_ALL = "\u0000select-all"

const selectAllKey = (group?: string) =>
  group === undefined ? SELECT_ALL : `${SELECT_ALL}:${group}`
const isSelectAll = (key: string) => key.startsWith(SELECT_ALL)

/**
 * The id of an option's element: an item's from its key, or a built-in
 * option's, like a create or select-all option, from its name.
 */
function optionId(id: string, key: string) {
  if (!key.startsWith("\u0000")) {
    return `${id}-option-${idPart(key)}`
  }
  return `${id}-${key.slice(1).replace(/[^\w-]/g, "-")}`
}

export { isSelectAll, optionId, SELECT_ALL, selectAllKey }
