// Options loaded for what the user typed, like a search on the server. It
// waits until typing pauses, cancels a request the next one replaces, so only
// the latest answer lands, and keeps the last items while the next load runs.
// Framework-free: pass `items`, `status` and `setQuery` to a combobox with
// `filter={false}`, or use any data layer instead.

/**
 * Whether options are loading, loaded or failed.
 * @stable
 */
type AsyncOptionsStatus = "idle" | "loading" | "error"

/**
 * What async options hold.
 * @stable
 */
type AsyncOptionsState<Item> = {
  /** The text the items are for, or are loading for. */
  query: string
  /** The loaded items. The previous ones stay while the next load runs. */
  items: Item[]
  /** Whether a load is waiting for typing to pause or running, or the last one failed. */
  status: AsyncOptionsStatus
  /** Why the last load failed. */
  error: unknown
  /** Whether `loadMore()` has another page to load. */
  hasMore: boolean
}

/**
 * What `load` receives besides the text.
 * @stable
 */
type AsyncOptionsContext = {
  /** Aborted when a newer load replaces this one. Pass it to `fetch`. */
  signal: AbortSignal
  /** Which page to load: 0 first, then 1, 2… from `loadMore()`. */
  page: number
}

/**
 * The options `createAsyncOptions` takes.
 * @stable
 */
type AsyncOptionsOptions = {
  /**
   * Milliseconds typing must pause before a load starts.
   * @defaultValue 200
   */
  debounce?: number
  /**
   * The text to load for at first.
   * @defaultValue ""
   */
  query?: string
  /**
   * Whether to load for the first text right away, before anyone types.
   * @defaultValue false
   */
  immediate?: boolean
  /**
   * How many characters the trimmed text needs before anything loads. Shorter
   * text clears the items and loads nothing.
   * @defaultValue 0
   */
  minLength?: number
}

/**
 * Loads options for a text, latest first. `load` returns the items, or
 * `{ items, hasMore }` for pages.
 * @stable
 */
function createAsyncOptions<Item>(
  load: (
    query: string,
    context: AsyncOptionsContext
  ) => Promise<Item[] | { items: Item[]; hasMore?: boolean }>,
  {
    debounce = 200,
    query = "",
    immediate = false,
    minLength = 0,
  }: AsyncOptionsOptions = {}
) {
  let state: AsyncOptionsState<Item> = {
    query,
    items: [],
    status: "idle",
    error: undefined,
    hasMore: false,
  }
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let page = 0

  function set(patch: Partial<AsyncOptionsState<Item>>) {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }

  function cancel() {
    clearTimeout(timer)
    timer = undefined
    controller?.abort()
    controller = undefined
  }

  const tooShort = (text: string) => text.trim().length < minLength

  function clear(text: string) {
    cancel()
    set({
      query: text,
      items: [],
      status: "idle",
      error: undefined,
      hasMore: false,
    })
  }

  function run(next: number) {
    if (tooShort(state.query)) {
      clear(state.query)
      return
    }
    controller?.abort()
    const current = new AbortController()
    controller = current
    page = next
    set({ status: "loading", error: undefined })
    load(state.query, { signal: current.signal, page: next }).then(
      (result) => {
        if (current.signal.aborted) {
          return
        }
        controller = undefined
        // The type rules it out, but a loader that resolves to nothing
        // shouldn't leave the list loading.
        const items = Array.isArray(result) ? result : (result?.items ?? [])
        const hasMore = !Array.isArray(result) && !!result?.hasMore
        set({
          items: next === 0 ? items : [...state.items, ...items],
          status: "idle",
          hasMore,
        })
      },
      (error) => {
        if (current.signal.aborted) {
          return
        }
        controller = undefined
        set({ status: "error", error })
      }
    )
  }

  if (immediate) {
    run(0)
  }

  return {
    /** The current items, text and status. */
    getState: () => state,
    /** Runs `listener` after every change. Returns an unsubscribe. */
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Loads for new text once typing pauses, replacing any load still running. */
    setQuery(next: string) {
      if (
        next === state.query &&
        (state.status === "loading" || timer !== undefined)
      ) {
        return
      }
      if (tooShort(next)) {
        clear(next)
        return
      }
      cancel()
      // Loading from the first key press: while typing pauses, the last
      // items aren't an answer to the new text, so nothing says "no match".
      set({ query: next, status: "loading", error: undefined })
      timer = setTimeout(() => {
        timer = undefined
        run(0)
      }, debounce)
    },
    /** Loads the current text again, now. */
    reload() {
      cancel()
      run(0)
    },
    /** Loads the next page and appends it, when `load` said there's more. */
    loadMore() {
      if (state.status === "loading" || !state.hasMore) {
        return
      }
      run(page + 1)
    },
    /** Stops any pending or running load. */
    cancel() {
      cancel()
      if (state.status === "loading") {
        set({ status: "idle" })
      }
    },
  }
}

/**
 * What `createAsyncOptions` returns: the loaded items, their status, and
 * methods to load more.
 * @stable
 */
type AsyncOptions<Item> = ReturnType<typeof createAsyncOptions<Item>>

export {
  type AsyncOptions,
  type AsyncOptionsContext,
  type AsyncOptionsOptions,
  type AsyncOptionsState,
  type AsyncOptionsStatus,
  createAsyncOptions,
}
