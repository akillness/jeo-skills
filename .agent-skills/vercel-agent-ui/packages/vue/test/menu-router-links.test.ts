// @vitest-environment jsdom
// A router's link calls `preventDefault()` before the item's handler hears the
// click. The item still selects and closes the menu.
import { afterEach, expect, test } from "vitest"
import { createApp, h, mergeProps, nextTick, type App } from "vue"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../src/menu"

Element.prototype.getAnimations ??= () => []

let app: App | undefined

afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

async function mount(onSelect?: (event: Event) => void) {
  const state = { open: true, actions: [] as string[] }
  app = createApp({
    render: () =>
      h(
        Menu,
        {
          defaultOpen: true,
          onOpenChange: (open: boolean) => (state.open = open),
          onAction: (value: string) => state.actions.push(value),
        },
        () => [
          h(MenuTrigger, null, () => "Account"),
          h(MenuContent, null, () =>
            h(
              MenuItem,
              { value: "settings", onSelect },
              {
                render: ({ props }: { props: Record<string, unknown> }) =>
                  h(
                    "a",
                    mergeProps(
                      {
                        href: "/settings",
                        onClick: (event: Event) => event.preventDefault(),
                      },
                      props
                    ),
                    "Settings"
                  ),
              }
            )
          ),
        ]
      ),
  })
  app.mount(document.body.appendChild(document.createElement("div")))
  await nextTick()
  return state
}

const link = () =>
  document.querySelector<HTMLAnchorElement>('a[href="/settings"]')!

test("a link item the router navigates closes the menu and runs its action", async () => {
  const state = await mount()
  link().click()
  await nextTick()
  expect(state.open).toBe(false)
  expect(state.actions).toEqual(["settings"])
})

test("@select can still keep the menu open", async () => {
  const state = await mount((event) => event.preventDefault())
  link().click()
  await nextTick()
  expect(state.open).toBe(true)
  expect(state.actions).toEqual([])
})

test("a click that opens the link elsewhere leaves the menu open", async () => {
  const state = await mount()
  link().dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true })
  )
  await nextTick()
  expect(state.open).toBe(true)
})
