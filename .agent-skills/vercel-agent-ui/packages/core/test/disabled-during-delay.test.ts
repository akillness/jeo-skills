// @vitest-environment jsdom
// Disabled while its open delay runs, a popup stays closed, as `disabled`
// says: it stops the popup from opening.
import { afterEach, expect, test } from "vitest"
import { hoverCard } from "../src/components/hover-card/hover-card"
import { menu } from "../src/components/menu/menu"
import { navigationMenu } from "../src/components/navigation-menu/navigation-menu"
import { popover } from "../src/components/popover/popover"
import { tooltip } from "../src/components/tooltip/tooltip"
import { mount, rerenderOf } from "../src/testing/mount"

const unmounts: (() => void)[] = []
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount())
  document.body.replaceChildren()
})

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test.each([
  { name: "tooltip", primitive: tooltip },
  { name: "hover card", primitive: hoverCard },
])(
  "a $name disabled while the pointer rests on its trigger doesn't open",
  async ({ primitive }) => {
    const view = mount(
      primitive as typeof tooltip,
      { delay: 200 },
      `<div><trigger>Ada</trigger><content>Card</content></div>`
    )
    unmounts.push(view.unmount)
    await view.hover(view.part("trigger")!)
    rerenderOf(view).setOptions({ disabled: true })
    await wait(300)
    expect(view.state.open).toBe(false)
  }
)

test("a hover card disabled while keyboard focus rests on its trigger doesn't open", async () => {
  const view = mount(
    hoverCard,
    { delay: 200 },
    `<div><button>Before</button><trigger as="button">Ada</trigger><content>Card</content></div>`
  )
  unmounts.push(view.unmount)
  view.root.querySelector("button")!.focus()
  await view.keys("Tab")
  rerenderOf(view).setOptions({ disabled: true })
  await wait(300)
  expect(view.state.open).toBe(false)
})

test("a popover trigger disabled while the pointer rests on it doesn't open the popover", async () => {
  const view = mount(
    popover,
    { openOnHover: true, delay: 200 },
    `<div><trigger>Share</trigger><content><button>Copy link</button></content></div>`
  )
  unmounts.push(view.unmount)
  await view.hover(view.part("trigger")!)
  rerenderOf(view).setProps("trigger", "", { disabled: true })
  await wait(300)
  expect(view.state.open).toBe(false)
})

test("a submenu trigger disabled while the pointer rests on it doesn't open the submenu", async () => {
  const root = mount(
    menu,
    {},
    `<div><trigger>Actions</trigger><content><item value="copy">Copy</item><div data-submenu></div></content></div>`
  )
  const sub = mount(
    menu,
    { parent: root.api, delay: 200 },
    `<span><trigger>Share</trigger><content><item value="mail">Mail</item></content></span>`
  )
  unmounts.push(sub.unmount, root.unmount)
  root.part("content")!.querySelector("[data-submenu]")!.append(sub.root)
  root.part("trigger")!.focus()
  await root.keys("Enter")
  await root.hover(sub.part("trigger")!)
  rerenderOf(sub).setProps("trigger", "", { disabled: true })
  await wait(300)
  expect(sub.state.open).toBe(false)
})

test("a navigation menu trigger disabled while the pointer rests on it doesn't open its panel", async () => {
  const view = mount(
    navigationMenu,
    { delay: 200 },
    `<root aria-label="Main"><list><item value="products"><trigger>Products</trigger><content><link href="#a">All products</link></content></item></list></root>`
  )
  unmounts.push(view.unmount)
  await view.hover(view.part("trigger")!)
  rerenderOf(view).setProps("trigger", "", { disabled: true })
  await wait(300)
  expect(view.state.value).toBe(null)
})
