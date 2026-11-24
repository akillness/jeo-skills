import { foldText } from "./match"

// Comparable form of a label in the user's language: case and accents that
// don't count there are gone, and so is surrounding space. "Éditer" matches
// "e". Folding is remembered, since filtering and typeahead fold the same
// labels on every keystroke.
const normalize = (text: string) => foldText(text).trim()

/**
 * Whether a key press types a character a typeahead should search for: one
 * printable character, without a shortcut modifier.
 * @stable
 */
function isTypeaheadKey(event: KeyboardEvent) {
  return (
    event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
  )
}

// Text a user would type to find an element, skipping hidden parts like
// shortcuts, and parts that aren't shown, like an unchecked item's indicator.
// The element's own `hidden` doesn't count: an item the search filtered out
// keeps its text, so it can match again when the search changes. Its own
// `aria-hidden` does, like a shortcut part's.
function textOf(el: Element) {
  let text = ""
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    const hidden = node.parentElement?.closest('[aria-hidden="true"], [hidden]')
    if (
      hidden &&
      el.contains(hidden) &&
      (hidden !== el || hidden.getAttribute("aria-hidden") === "true")
    ) {
      continue
    }
    text += node.textContent
  }
  return text
}

/**
 * What a user would type to find an item: its text, with whitespace collapsed
 * as the page shows it, or its `aria-label` when it shows none, like an item
 * with only an icon. Skips text a user can't see, like shortcut hints marked
 * `aria-hidden`.
 * @stable
 */
function labelOf(el: HTMLElement) {
  const text = textOf(el).replace(/\s+/g, " ").trim()
  return text || (el.getAttribute("aria-label") ?? "")
}

function searchStart(current: number, query: string) {
  return query.length === 1 ? current + 1 : Math.max(current, 0)
}

/**
 * Typeahead as the WAI-ARIA Authoring Practices describe it for menus,
 * listboxes and trees: typed characters build a query that clears after
 * `timeout` ms, and the next item whose label starts with it is the match.
 * Pressing the same character again steps through the items that start with
 * it, unless a label starts with the repeated characters, like "Llama" for
 * "ll". Case and accents fold the way the user's language folds them.
 *
 * Returns `search(key, labels, current)`, which gives the index to focus or
 * -1, with `reset()` and `active()` (whether a query is in progress, so Space
 * continues it rather than activating).
 *
 * @example
 * const typeahead = createTypeahead()
 * // In a keydown handler:
 * if (isTypeaheadKey(event)) {
 *   const items = elements(context, "item")
 *   const index = typeahead(event.key, items.map((item) => labelOf(item.el)), current)
 *   if (index !== -1) items[index].el.focus()
 * }
 * @stable
 */
function createTypeahead(timeout = 500) {
  let query = ""
  let lastKey = ""
  let stepping = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function reset() {
    query = ""
    lastKey = ""
    stepping = false
    clearTimeout(timer)
  }

  function scan(labels: string[], prefix: string, start: number) {
    const count = labels.length
    for (let step = 0; step < count; step++) {
      const index = (((start + step) % count) + count) % count
      if (normalize(labels[index]).startsWith(prefix)) {
        return index
      }
    }
    return -1
  }

  function search(key: string, labels: string[], current: number) {
    // Space only continues a query. Before one, it's the key that activates.
    if (key.length !== 1 || (key === " " && !query)) {
      return -1
    }
    clearTimeout(timer)
    timer = setTimeout(reset, timeout)
    const char = normalize(key) || key
    stepping = char === lastKey && (stepping || query.length === 1)
    lastKey = char
    query += char

    if (stepping) {
      const whole = scan(labels, query, Math.max(current, 0))
      return whole !== -1
        ? whole
        : scan(labels, char, searchStart(current, char))
    }
    return scan(labels, query, searchStart(current, query))
  }

  return Object.assign(search, { reset, active: () => query.length > 0 })
}

export { createTypeahead, isTypeaheadKey, labelOf, normalize, textOf }
