// A bound value whose items load later, like from a request, shows its label
// once they arrive.
import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import App from "./apps/combobox-late-items-app.svelte"

test("a bound value set before its items load shows their label once they arrive", async () => {
  const target = document.body.appendChild(document.createElement("div"))
  const props = $state<{ items: { value: string; label: string }[] }>({
    items: [],
  })
  const app = mount(App, { target, props })
  flushSync()
  await new Promise((done) => setTimeout(done))
  props.items = [
    { value: "apple", label: "Apple" },
    { value: "banana", label: "Banana" },
  ]
  flushSync()
  await new Promise((done) => setTimeout(done))
  expect(target.querySelector("input")!.value).toBe("Banana")
  unmount(app)
  target.remove()
})
