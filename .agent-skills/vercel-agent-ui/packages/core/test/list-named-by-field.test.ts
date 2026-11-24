// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { autocomplete } from "../src/components/autocomplete/autocomplete"
import { combobox } from "../src/components/combobox/combobox"
import { command } from "../src/components/command/command"
import { mount } from "../src/testing"

const mounts: { unmount: () => void }[] = []
afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
})

const views = {
  combobox: (input: string) =>
    mount(
      combobox,
      { items: ["Astro", "Next.js"], defaultOpen: true },
      `<root>${input}<content><list></list></content></root>`
    ),
  autocomplete: (input: string) =>
    mount(
      autocomplete,
      { items: ["Astro", "Next.js"], defaultOpen: true },
      `<root>${input}<content><list></list></content></root>`
    ),
  command: (input: string) =>
    mount(
      command,
      { items: ["Astro", "Next.js"] },
      `<root>${input}<list></list></root>`
    ),
}

for (const [name, view] of Object.entries(views)) {
  test(`a ${name} list takes its field's aria-label, not the text typed in it`, async () => {
    const mounted = view(`<input aria-label="Framework">`)
    mounts.push(mounted)
    await Promise.resolve()
    const list = mounted.part("list")!
    expect(list.getAttribute("aria-label")).toBe("Framework")
    expect(list.hasAttribute("aria-labelledby")).toBe(false)
  })

  test(`a ${name} list takes the ids that name its field`, async () => {
    const heading = document.body.appendChild(document.createElement("h2"))
    heading.id = "framework-heading"
    const mounted = view(`<input aria-labelledby="framework-heading">`)
    mounts.push(mounted)
    await Promise.resolve()
    expect(mounted.part("list")!.getAttribute("aria-labelledby")).toBe(
      "framework-heading"
    )
  })
}
