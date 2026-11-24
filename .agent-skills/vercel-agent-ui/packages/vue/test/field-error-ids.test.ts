// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { createApp, h, nextTick, shallowRef, type App } from "vue"
import { Field, FieldError, Input } from "../src"

const apps: App[] = []
afterEach(() => apps.splice(0).forEach((app) => app.unmount()))

const settled = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve))
}

test("every error that shows stays described as another one starts or stops showing", async () => {
  const matches = shallowRef<boolean[]>([false, true])
  const el = document.body.appendChild(document.createElement("div"))
  const app = createApp(() =>
    h(Field, { invalid: true }, () => [
      h(Input),
      ...matches.value.map((match, index) =>
        h(FieldError, { key: index, match }, () => `Error ${index}`)
      ),
    ])
  )
  apps.push(app)
  app.mount(el)
  const read = () => {
    const ids = [...el.querySelectorAll('[data-slot="field-error"]')].map(
      (error) => error.id
    )
    const described =
      el.querySelector("input")!.getAttribute("aria-describedby") ?? ""
    return { ids, described: described.split(" ").filter(Boolean) }
  }
  for (const next of [
    [false, true],
    [true, true],
    [false, true],
    [true, true, true],
  ]) {
    matches.value = next
    await settled()
    const { ids, described } = read()
    expect(new Set(ids).size).toBe(ids.length)
    expect([...described].sort()).toEqual([...ids].sort())
  }
})
