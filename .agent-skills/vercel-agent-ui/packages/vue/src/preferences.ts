import { preferencesScript, type PreferenceLike } from "@ui-sdk/core"
import {
  computed,
  defineComponent,
  h,
  onMounted,
  onScopeDispose,
  shallowRef,
  watch,
  type PropType,
  type ShallowRef,
  type SlotsType,
  type VNode,
} from "vue"

/**
 * Shows preferences on `data-*` attributes, so CSS styles by them from the
 * first paint: global ones on `<html>`, the rest on its own element, which
 * has `display: contents`. On the server it renders one inline script as its
 * first child, which puts every saved value on its attribute as the page
 * loads, before hydration. Content that reads a preference, through
 * `usePreference`, catches up after hydration.
 * @experimental
 */
const Preferences = defineComponent({
  name: "Preferences",
  props: {
    /** The preferences to show, from `createPreference` or `createColorScheme`. */
    preferences: {
      type: Array as PropType<readonly PreferenceLike[]>,
      required: true,
    },
    /** The nonce your Content Security Policy gives inline scripts. */
    nonce: String,
  },
  slots: Object as SlotsType<{ default?: () => VNode[] }>,
  setup(props, { slots }) {
    // The server's values until mounted, so the first client render matches it.
    const values = shallowRef(
      props.preferences.map((preference) => preference.initialState.value)
    )
    // The script is in the server's HTML until then. A client-only render
    // drops it right away, and the browser never runs a script Vue inserts.
    const mounted = shallowRef(false)
    const element = shallowRef<HTMLElement>()
    let stop = () => {}
    const follow = (list: readonly PreferenceLike[]) => {
      stop()
      const read = () => {
        values.value = list.map((preference) => preference.get().value)
        // Written to its own element too, since a restore that
        // `onValueChange` canceled leaves the rendered value as it was, and
        // Vue wouldn't touch the attribute the script set.
        for (const preference of list) {
          ;(preference.global
            ? document.documentElement
            : element.value
          )?.setAttribute(preference.attribute, preference.get().value)
        }
      }
      const stops = list.map((preference) => preference.subscribe(read))
      read()
      stop = () => stops.forEach((each) => each())
    }
    onMounted(() => {
      mounted.value = true
      follow(props.preferences)
    })
    // A template's inline list is a new array each render, so only a different preference starts over.
    watch(
      () => props.preferences,
      (list, previous) => {
        const same =
          list.length === previous.length &&
          list.every((preference, index) => preference === previous[index])
        if (mounted.value && !same) {
          follow(list)
        }
      }
    )
    onScopeDispose(() => stop())
    const attributes = computed(() => {
      const shown: Record<string, string> = {}
      props.preferences.forEach((preference, index) => {
        if (!preference.global) {
          shown[preference.attribute] =
            values.value[index] ?? preference.initialState.value
        }
      })
      return shown
    })
    return () =>
      h(
        "div",
        {
          "data-slot": "preferences",
          ref: element,
          ...attributes.value,
          // The script changes these attributes before hydration, so they may differ from the server's HTML.
          "data-allow-mismatch": "attribute",
          style: { display: "contents" },
        },
        [
          mounted.value
            ? null
            : h("script", {
                nonce: props.nonce,
                innerHTML: preferencesScript(props.preferences),
              }),
          slots.default?.(),
        ]
      )
  },
})

/**
 * A preference's state, like `{ value: "dark" }`, or a color scheme's, as a
 * computed ref. It's the server's until mounted, so the page hydrates without
 * a mismatch, and the saved value right after.
 * @experimental
 */
function usePreference<State>(preference: {
  get: () => State
  initialState: State
  subscribe: (listener: () => void) => () => void
}) {
  const state: ShallowRef<State> = shallowRef(preference.initialState)
  let stop = () => {}
  onMounted(() => {
    // Subscribing first reads back what was saved.
    stop = preference.subscribe(() => (state.value = preference.get()))
    state.value = preference.get()
  })
  onScopeDispose(() => stop())
  return computed(() => state.value)
}

export { Preferences, usePreference }
