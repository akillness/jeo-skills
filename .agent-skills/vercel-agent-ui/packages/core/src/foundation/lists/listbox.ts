// Filtering for the listbox engine behind Select, Combobox, Autocomplete,
// Command and TriggerMenu, ranked by score with case and accents folded.
// Listbox, which nobody types into, uses the engine alone.
import {
  createListboxEngine,
  isGroup,
  isSeparator,
  toListItem,
  type ListData,
  type ListFilter,
  type ListGroup,
  type ListItem,
} from "./listbox-engine"
import { foldText, leadingSpaces } from "../text/match"

// Whether text matches a query the way a filter asks. Case and accents are
// ignored the way the user's language ignores them.
function textMatches(
  text: string,
  query: string,
  mode: "contains" | "startsWith"
) {
  const needle = foldText(query.trim())
  if (!needle) {
    return true
  }
  const haystack = foldText(text)
  return mode === "startsWith"
    ? haystack.startsWith(needle, leadingSpaces(haystack))
    : haystack.includes(needle)
}

// How well an item matches a query: 0 hides it, and higher ranks it first.
function itemScore<T>(
  item: ListItem<T>,
  query: string,
  filter: ListFilter<T> | undefined
) {
  if (filter === false || filter === undefined || !query.trim()) {
    return 1
  }
  if (typeof filter === "function") {
    const result = filter(item, query)
    return typeof result === "number" ? Math.max(0, result) : result ? 1 : 0
  }
  return [item.label, ...(item.keywords ?? [])].some((text) =>
    textMatches(text, query, filter)
  )
    ? 1
    : 0
}

function itemMatches<T>(
  item: ListItem<T>,
  query: string,
  filter: ListFilter<T> | undefined
) {
  return itemScore(item, query, filter) > 0
}

// The data a list shows for a query: matching items, groups that still have
// some, and separators between what's left. Ranking puts the best first, and
// drops separators once it moves an entry out of the sections they divide.
function filterData<T>(
  data: ListData<T>,
  query: string,
  filter: ListFilter<T> | undefined,
  { rank = false }: { rank?: boolean } = {}
) {
  if (filter === false || filter === undefined || !query.trim()) {
    return data
  }
  if (rank) {
    return rankData(data, query, filter)
  }
  const result: ListData<T> = []
  // A separator waits for the next kept entry, so none leads, trails or doubles.
  let separator: ListData<T>[number] | undefined
  const keep = (entry: ListData<T>[number]) => {
    if (separator && result.length) {
      result.push(separator)
    }
    separator = undefined
    result.push(entry)
  }
  for (const entry of data) {
    if (isSeparator(entry)) {
      separator = entry
      continue
    }
    if (isGroup(entry)) {
      const items = entry.items.filter((child) =>
        itemMatches(toListItem(child), query, filter)
      )
      if (items.length) {
        keep({ ...entry, items })
      }
      continue
    }
    if (itemMatches(toListItem(entry), query, filter)) {
      keep(entry)
    }
  }
  return result
}

type Ranked<T> = {
  entry: ListData<T>[number]
  score: number
  separator?: ListData<T>[number]
}

// Sorts by score, best first. Equal scores keep their order, since sort is stable.
const byScore = <T>(a: Ranked<T>, b: Ranked<T>) => b.score - a.score

function rankData<T>(data: ListData<T>, query: string, filter: ListFilter<T>) {
  const ranked: Ranked<T>[] = []
  let separator: ListData<T>[number] | undefined
  const keep = (entry: ListData<T>[number], score: number) => {
    ranked.push({
      entry,
      score,
      separator: ranked.length ? separator : undefined,
    })
    separator = undefined
  }
  for (const entry of data) {
    if (isSeparator(entry)) {
      separator = entry
      continue
    }
    if (isGroup(entry)) {
      const items: Ranked<T>[] = []
      for (const child of entry.items) {
        const score = itemScore(toListItem(child), query, filter)
        if (score > 0) {
          items.push({ entry: child, score })
        }
      }
      if (!items.length) {
        continue
      }
      items.sort(byScore)
      keep(
        {
          ...entry,
          items: items.map((item) => item.entry) as ListGroup<T>["items"],
        },
        items[0].score
      )
      continue
    }
    const score = itemScore(toListItem(entry), query, filter)
    if (score > 0) {
      keep(entry, score)
    }
  }
  const sorted = [...ranked].sort(byScore)
  if (sorted.some((item, index) => item !== ranked[index])) {
    return sorted.map((item) => item.entry)
  }
  return ranked.flatMap((item) =>
    item.separator ? [item.separator, item.entry] : [item.entry]
  )
}

const filtering = { data: filterData, matches: itemMatches }

/** The listbox engine, filtering by `query` the way `filter` asks. */
function createFilteredListbox(
  config: Parameters<typeof createListboxEngine>[0]
) {
  return createListboxEngine(config, filtering)
}

/**
 * Reads a list's `filter` attribute on a custom element: `"false"` keeps
 * every item, one of `modes` filters that way, and any other value, like a
 * bare `filter`, the way `fallback` does.
 */
function filterAttribute<Mode extends string>(
  modes: readonly Mode[],
  fallback: NoInfer<Mode>
) {
  return (attribute: string | null) => {
    if (attribute === null) {
      return undefined
    }
    if (attribute === "false") {
      return false
    }
    return modes.includes(attribute as Mode) ? (attribute as Mode) : fallback
  }
}

export {
  createFilteredListbox,
  filterAttribute,
  filterData,
  itemMatches,
  textMatches,
}
export {
  flattenData,
  highlightable,
  highlightedValue,
  highlightFromCode,
  itemKey,
  revealInList,
  toListItem,
  type ListData,
  type ListEmptyState,
  type ListEntry,
  type ListFilter,
  type ListGroup,
  type ListHighlightDetails,
  type ListItem,
  type Listbox,
  type ListSeparator,
  type ListStatusState,
} from "./listbox-engine"
