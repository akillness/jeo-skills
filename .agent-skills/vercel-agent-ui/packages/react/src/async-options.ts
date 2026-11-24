import {
  createAsyncOptions,
  type AsyncOptionsContext,
  type AsyncOptionsOptions,
} from "@ui-sdk/core/async-options"
import * as React from "react"

/**
 * Options loaded for what the user types, latest first. Pass `items`, `status`
 * and `setQuery` (as `onQueryChange`) to a combobox with `filter={false}`.
 * @stable
 */
function useAsyncOptions<Item>(
  load: (
    query: string,
    context: AsyncOptionsContext
  ) => Promise<Item[] | { items: Item[]; hasMore?: boolean }>,
  options?: AsyncOptionsOptions
) {
  const latest = React.useRef(load)
  React.useLayoutEffect(() => {
    latest.current = load
  })
  // Nothing loads while rendering, which React may repeat or throw away, or
  // on the server. An `immediate` load starts once the component mounts.
  const [{ helper, immediate, initial }] = React.useState(() => {
    const helper = createAsyncOptions<Item>(
      (query, context) => latest.current(query, context),
      {
        ...options,
        immediate: false,
      }
    )
    return {
      helper,
      immediate: !!options?.immediate,
      initial: helper.getState(),
    }
  })
  // Cancels on unmount only. StrictMode unmounts and mounts again at once, which keeps the first load.
  const mounted = React.useRef(false)
  React.useEffect(() => {
    mounted.current = true
    const { status, items } = helper.getState()
    if (immediate && status === "idle" && !items.length) {
      helper.reload()
    }
    return () => {
      mounted.current = false
      queueMicrotask(() => !mounted.current && helper.cancel())
    }
  }, [helper, immediate])
  const state = React.useSyncExternalStore(
    helper.subscribe,
    helper.getState,
    helper.getState
  )
  return {
    ...state,
    // Until it starts, an immediate load shows as loading, so nothing says "no match" first.
    ...(immediate && state === initial && { status: "loading" as const }),
    setQuery: helper.setQuery,
    reload: helper.reload,
    loadMore: helper.loadMore,
  }
}

export { createAsyncOptions } from "@ui-sdk/core/async-options"
export type {
  AsyncOptions,
  AsyncOptionsContext,
  AsyncOptionsOptions,
  AsyncOptionsState,
  AsyncOptionsStatus,
} from "@ui-sdk/core/async-options"

export { useAsyncOptions }
