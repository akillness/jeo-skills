// What the lists people search share beyond filtering: an item's text with
// what matched marked, result counts said to screen readers once typing
// pauses, the next page loading when the end of the list is reached, and
// whether opening moves real focus into the list for touch screen readers,
// which ignore aria-activedescendant.
import { announce } from "../platform/announce"
import { sourceOf } from "../kernel/modality"
import { trusted } from "../kernel/trusted"
import { type ListFilter } from "./listbox"
import { matchRanges, matchSegments, type MatchSegment } from "../text/match"
import type { BaseSlotProps, SlotDefinition } from "../kernel/primitive-types"
import type { Store } from "../kernel/store"

/**
 * What a list announces to screen readers: how many items match after typing, or a removed value.
 * @stable
 */
type ListAnnouncement =
  | {
      type: "results"
      /** How many items match. */
      count: number
      /** The text they match. */
      query: string
      /** Whether results are still loading. */
      loading: boolean
    }
  | {
      type: "removed"
      /** The label of the value that was removed. */
      label: string
    }

/** What a list announces by default, in English: "3 results", "No results", "Loading" or "Pear removed". */
function describeList(change: ListAnnouncement) {
  if (change.type === "removed") {
    return `${change.label} removed`
  }
  if (change.loading) {
    return "Loading"
  }
  if (!change.count) {
    return "No results"
  }
  return change.count === 1 ? "1 result" : `${change.count} results`
}

/** What an item's text part receives: its text split where it matched what was typed. */
type ListItemTextState = {
  /** The text in pieces, each marked when it matched. Joined, they're the whole text. */
  segments: MatchSegment[]
  /** Whether any piece matched. */
  matched: boolean
}

/** Props of an item's text part, in every framework. */
type ListItemTextProps = {
  /** @internal The text to mark, from the part's content or its item's label. */
  text: string
  /** @internal Writes the marked text into the element, for web components. */
  write?: boolean
}

// How a filter marks matches, or undefined for one that can't say, like a function.
function matchMode(filter: ListFilter<unknown> | "fuzzy" | undefined) {
  return filter === "contains" || filter === "startsWith" || filter === "fuzzy"
    ? filter
    : undefined
}

// What an item's text part needs from its component: the text that filters
// the list now, and how it matches.
type ItemTextApi = {
  internal: {
    matchQuery: () => string
    matchMode: () => "contains" | "startsWith" | "fuzzy" | undefined
  }
}

const unmatched = (text: string) => ({
  segments: [{ text, match: false }],
  matched: false,
})

// An item's text, split where the query matched, so the parts can be marked.
// The same text and query give the same state object, so a part that reads it
// only renders again when its marks change.
function itemTextPart<State extends object, Api extends ItemTextApi>() {
  const memo = new WeakMap<
    object,
    Map<string, { text: string; query: string; state: ListItemTextState }>
  >()
  const stateOf = (api: Api, key: string, text: string) => {
    const { matchQuery, matchMode: mode } = api.internal
    const query = mode() ? matchQuery() : ""
    let cache = memo.get(api)
    if (!cache) {
      memo.set(api, (cache = new Map()))
    }
    const last = cache.get(key)
    if (last && last.text === text && last.query === query) {
      return last.state
    }
    const ranges = query.trim() ? matchRanges(text, query, mode()!) : []
    const state = ranges.length
      ? { segments: matchSegments(text, ranges), matched: true }
      : last && !last.state.matched && last.text === text
        ? last.state
        : unmatched(text)
    cache.set(key, { text, query, state })
    return state
  }
  return {
    // Internal: passed by renderers. Its id is made for it.
    props: { text: "string", write: "boolean", id: "id" },
    state: (state, { api, key, props }) => stateOf(api, key, props.text),
    attrs: (state, { api, key, props }) => ({
      "data-matched": stateOf(api, key, props.text).matched ? "" : undefined,
    }),
    bind(el, { api, key, props, store }) {
      if (!props.write) {
        return
      }
      // Web components mark their own text, rebuilding it only when the marks change.
      let written: ListItemTextState | undefined
      const write = () => {
        const next = stateOf(api, key, props.text)
        if (next === written) {
          return
        }
        written = next
        el.replaceChildren(
          ...next.segments.map(({ text, match }) => {
            if (!match) {
              return text
            }
            const mark = el.ownerDocument.createElement("mark")
            mark.textContent = text
            return mark
          })
        )
      }
      write()
      const unsubscribe = store.subscribe(write)
      return () => {
        unsubscribe()
        el.textContent = props.text
      }
    },
  } satisfies SlotDefinition<
    State,
    Api,
    ListItemTextProps & BaseSlotProps,
    ListItemTextState
  >
}

// Whether opening from this event should move real focus into the list.
// VoiceOver on iOS ignores aria-activedescendant, so a screen reader's tap,
// which arrives as a click with no pointer or key behind it, gets real focus.
const opensIntoList = (event?: Event) =>
  !!event && trusted(event) && sourceOf(event) === "virtual"

// How long typing must pause before result counts are announced.
const ANNOUNCE_DELAY = 500

// Says how many items match once typing pauses, through the page's shared
// announcer, unless the component renders a status part, which says it
// instead. `shown` is whether the list is on screen. Results that were
// loading are said again once they arrive.
function announceResults({
  store,
  query,
  count,
  loading,
  shown,
  silent,
  announcement,
}: {
  store: Store<object>
  query: () => string
  count: () => number
  loading: () => boolean
  shown: () => boolean
  silent: () => boolean
  announcement: () =>
    ((change: ListAnnouncement) => string | null | undefined) | undefined
}) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let previousQuery = query()
  let previousLoading = loading()
  let waiting = false
  const say = () => {
    timer = undefined
    // An empty field shows everything, or suggestions, which aren't results to count.
    if (!shown() || silent() || !query().trim()) {
      return
    }
    const change: ListAnnouncement = {
      type: "results",
      count: count(),
      query: query(),
      loading: loading(),
    }
    const message = (announcement() ?? describeList)(change)
    if (message) {
      announce(message)
    }
    // Results still loading are said again once they arrive.
    waiting = change.loading
  }
  store.subscribe(() => {
    const next = query()
    const nowLoading = loading()
    const typed = next !== previousQuery
    const arrived = previousLoading && !nowLoading && waiting
    previousQuery = next
    previousLoading = nowLoading
    if (!typed && !arrived) {
      return
    }
    clearTimeout(timer)
    timer = setTimeout(say, ANNOUNCE_DELAY)
  })
}

// Asks for the next page once the end of the list is reached, by the
// highlight or by scrolling, at most once per page: not while one loads, and
// not again for the same items unless the last load failed.
function createLoadMore({
  count,
  status,
  onLoadMore,
}: {
  count: () => number
  status: () => "idle" | "loading" | "error"
  onLoadMore: () => (() => void) | undefined
}) {
  let requestedAt = -1
  function reached() {
    const load = onLoadMore()
    const current = status()
    if (!load || current === "loading") {
      return
    }
    if (count() === requestedAt && current !== "error") {
      return
    }
    requestedAt = count()
    load()
  }
  // Scrolling near the end of whatever scrolls inside `el`. Scroll events
  // don't bubble, so one listener in the capture phase hears every list.
  function bind(el: HTMLElement) {
    const onScroll = (event: Event) => {
      const target = event.target as HTMLElement
      if (!(target instanceof HTMLElement)) {
        return
      }
      // Within the height of a row or so of the end.
      if (target.scrollTop + target.clientHeight >= target.scrollHeight - 40) {
        reached()
      }
    }
    el.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => el.removeEventListener("scroll", onScroll, { capture: true })
  }
  return { reached, bind }
}

export {
  announceResults,
  createLoadMore,
  describeList,
  itemTextPart,
  type ListAnnouncement,
  type ListItemTextProps,
  type ListItemTextState,
  matchMode,
  opensIntoList,
}
