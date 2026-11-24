import { render } from "@solidjs/web"
import { createSignal, flush } from "solid-js"
import { expect, test } from "vitest"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "../src/collapsible"
import { Listbox, ListboxItem } from "../src/listbox"

function mount(code: () => any) {
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(code, root)
  flush()
  return { root, dispose }
}

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve()
  }
  flush()
}

test("Solid's bound event form runs first and can prevent the part's action", async () => {
  const calls: string[] = []
  const prevent = (data: string, event: MouseEvent) => {
    calls.push(data)
    event.preventDefault()
  }
  const { root, dispose } = mount(() => (
    <Collapsible onOpenChange={(open) => calls.push(`open:${open}`)}>
      <CollapsibleTrigger onClick={[prevent, "part"]}>
        Details
      </CollapsibleTrigger>
      <CollapsiblePanel>Panel</CollapsiblePanel>
    </Collapsible>
  ))
  root.querySelector("button")!.click()
  await settle()
  expect(calls).toEqual(["part"])
  dispose()
})

test("a form gets every value once multiple turns on", async () => {
  const [multiple, setMultiple] = createSignal(false)
  const [value, setValue] = createSignal<string | string[]>("a")
  const { root, dispose } = mount(() => (
    <form>
      <Listbox
        name="choice"
        aria-label="Choice"
        multiple={multiple() as false}
        value={value() as string}
      >
        <ListboxItem value="a">A</ListboxItem>
        <ListboxItem value="b">B</ListboxItem>
      </Listbox>
    </form>
  ))
  await settle()
  const form = root.querySelector("form")!
  expect(new FormData(form).getAll("choice")).toEqual(["a"])
  setMultiple(true)
  setValue(["a", "b"])
  await settle()
  expect(new FormData(form).getAll("choice")).toEqual(["a", "b"])
  dispose()
})
