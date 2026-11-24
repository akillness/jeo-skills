// @vitest-environment jsdom
// `createParts` defines an element per part and returns their classes, named
// like the parts other adapters return.
import { definePrimitive } from "@ui-sdk/core"
import { expect, test } from "vitest"
import { createParts, wrappedButton } from "../src/define-element"

const searchField = definePrimitive({
  name: "search-field",
  state: () => ({ value: "" }),
  api: (context) => ({ set: (value: string) => context.store.set({ value }) }),
  slots: (slot) => ({
    input: slot({ attrs: (state) => ({ value: state.value }) }),
    clear: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }) => api.set(""),
    }),
  }),
})

test("createParts returns the class it defined for each part", () => {
  const parts = createParts(searchField, {
    root: "test-search-field",
    input: "test-search-field-input",
    clear: { tag: "test-search-field-clear", target: wrappedButton },
  })
  expect(Object.keys(parts)).toEqual(["Root", "Input", "Clear"])
  expect(parts.Root).toBe(customElements.get("test-search-field"))
  expect(parts.Input).toBe(customElements.get("test-search-field-input"))
  expect(document.createElement("test-search-field-clear")).toBeInstanceOf(
    parts.Clear!
  )
})

test("a second call returns the classes the first defined", () => {
  const tags = { root: "test-again", input: "test-again-input" }
  expect(createParts(searchField, tags)).toEqual(createParts(searchField, tags))
})
