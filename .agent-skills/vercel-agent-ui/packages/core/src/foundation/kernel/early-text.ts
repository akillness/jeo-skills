// Text typed into the page's fields before its script ran. Vue and Svelte
// write a field's value as they hydrate it, before any part binds, so they
// note it once, as they make their first instance, ahead of hydration.
let early: WeakMap<HTMLInputElement, string> | undefined

function noteEarlyText() {
  if (early || typeof document === "undefined") {
    return
  }
  early = new WeakMap()
  for (const input of Array.from(document.querySelectorAll("input"))) {
    if (input.value !== input.defaultValue) {
      early.set(input, input.value)
    }
  }
}

function takeEarlyText(input: HTMLInputElement) {
  const text = early?.get(input)
  early?.delete(input)
  return text
}

export { noteEarlyText, takeEarlyText }
