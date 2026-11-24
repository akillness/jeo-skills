// Moves naming and state ARIA attributes from a host element to the input it
// renders, like `aria-label` from <ui-otp-input> to its <input>, which is
// what takes focus. Set on the host later, like `aria-invalid` after a failed
// submit or a new label after a language switch, they move too. Setting one
// on the host is how to change it; the input keeps what it was given.
function forwardAttributes(
  host: HTMLElement,
  input: HTMLElement,
  names: readonly string[]
) {
  const move = (keep: boolean) => {
    for (const name of names) {
      const value = host.getAttribute(name)
      if (value === null) {
        continue
      }
      if (!keep || !input.hasAttribute(name)) {
        input.setAttribute(name, value)
      }
      host.removeAttribute(name)
    }
  }
  // An input the author wrote keeps the attributes it already has at first.
  move(true)
  new MutationObserver(() => move(false)).observe(host, {
    attributeFilter: [...names],
  })
}

export { forwardAttributes }
