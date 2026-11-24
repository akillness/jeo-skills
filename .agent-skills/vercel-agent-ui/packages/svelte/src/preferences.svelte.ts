/**
 * A preference's state, like `{ value: "dark" }`, or a color scheme's, as
 * `.current`. It's the server's until mounted, so the page hydrates without
 * a mismatch, and the saved value right after.
 * @experimental
 */
function usePreference<State>(preference: {
  get: () => State
  initialState: State
  subscribe: (listener: () => void) => () => void
}) {
  let state = $state.raw(preference.initialState)
  $effect(() => {
    // Subscribing first reads back what was saved.
    const stop = preference.subscribe(() => (state = preference.get()))
    state = preference.get()
    return stop
  })
  return {
    /** The current state. */
    get current() {
      return state
    },
  }
}

export { usePreference }
