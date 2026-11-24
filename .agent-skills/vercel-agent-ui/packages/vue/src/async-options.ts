import {
  createAsyncOptions,
  type AsyncOptionsContext,
  type AsyncOptionsOptions,
  type AsyncOptionsState,
} from "@ui-sdk/core/async-options"
import { getCurrentInstance, onMounted, onScopeDispose, shallowRef } from "vue"

/**
 * Options loaded for what the user types, latest first. Returns reactive state
 * and `setQuery`, for a combobox with `:filter="false"`.
 * @stable
 */
function useAsyncOptions<Item>(
  load: (
    query: string,
    context: AsyncOptionsContext
  ) => Promise<Item[] | { items: Item[]; hasMore?: boolean }>,
  options?: AsyncOptionsOptions
) {
  // Setup runs on the server too, so an `immediate` load starts once the
  // component mounts. Until then it shows as loading, so nothing says "no match" first.
  const helper = createAsyncOptions<Item>(load, {
    ...options,
    immediate: false,
  })
  const immediate = !!options?.immediate
  const initial = helper.getState()
  const state = shallowRef<AsyncOptionsState<Item>>(
    immediate ? { ...initial, status: "loading" } : initial
  )
  onScopeDispose(helper.subscribe(() => (state.value = helper.getState())))
  const start = () => {
    if (immediate && helper.getState() === initial) {
      helper.reload()
    }
  }
  // A component that has already mounted, like one calling a store from its
  // own `onMounted`, won't mount again, and outside a component nothing mounts:
  // both start now, in the browser only.
  const instance = getCurrentInstance()
  if (instance && !instance.isMounted) {
    onMounted(start)
  } else if (typeof document !== "undefined") {
    start()
  }
  onScopeDispose(() => helper.cancel())
  return {
    state,
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
