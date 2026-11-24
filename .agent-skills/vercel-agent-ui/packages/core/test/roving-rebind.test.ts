// @vitest-environment jsdom
// An item element a framework reuses under a new key keeps focus where it belongs.
import { afterEach, expect, test } from "vitest"
import { createRovingFocus } from "../src/foundation/focus/roving-focus"
import { createStore } from "../src/foundation/kernel/store"

afterEach(() => document.body.replaceChildren())

const tick = () => new Promise((resolve) => setTimeout(resolve))

function group() {
  const store = createStore({ focused: null as string | null }, [])
  const roving = createRovingFocus(
    { store, onDestroy: () => {} },
    { slot: "item", key: "focused" }
  )
  const add = (
    itemKey: string,
    el = document.body.appendChild(document.createElement("button"))
  ) => ({
    el,
    leave: roving.bind(el, { key: itemKey, props: {} }),
  })
  return { store, roving, add }
}

test("a move waiting for its item ignores the element it left rebinding under another key", async () => {
  const { store, roving, add } = group()
  const source = add("1")
  source.el.focus()
  roving.focus("next")
  source.leave()
  add("2", source.el)
  const next = add("next")
  await tick()
  expect(store.get().focused).toBe("next")
  expect(document.activeElement).toBe(next.el)
})

test("a focused item removed and rebound under a new key in the same task takes focus back", async () => {
  const { store, add } = group()
  const item = add("a")
  item.el.focus()
  item.el.remove()
  item.leave()
  document.body.append(item.el)
  add("b", item.el)
  await tick()
  expect(store.get().focused).toBe("b")
  expect(document.activeElement).toBe(item.el)
})
