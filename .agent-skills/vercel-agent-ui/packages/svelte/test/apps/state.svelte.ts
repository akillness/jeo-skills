// A reactive props object for `mount()`, so a test can change a prop and see
// the component follow, as a parent would.
function reactive<T extends Record<string, unknown>>(props: T) {
  const state = $state(props)
  return state
}

export { reactive }
