import { afterEach, expect } from "vitest"

// jsdom has no Web Animations API and no layout: nothing animates, so every
// list is empty, and scrolling an element into view does nothing.
if (typeof Element !== "undefined") {
  Element.prototype.getAnimations ??= () => []
  Element.prototype.scrollIntoView ??= () => {}
}

// Options reach an instance from an effect. Anything else it writes while
// they're handed over would write the parts' `$state` inside that effect,
// which Svelte's docs say not to do. Core's development build records those
// writes as relays, and every test fails on one.
afterEach(() => {
  const history = (
    globalThis as Record<symbol, { relays?: unknown[] } | undefined>
  )[Symbol.for("ui-sdk.devtools.history@1")]
  const relays = history?.relays?.splice(0) ?? []
  expect(relays, "state written while options were handed over").toEqual([])
})
