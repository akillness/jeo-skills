// @vitest-environment jsdom
// An instance's life as Vue sees it: <KeepAlive> caching a page that's away,
// <Suspense> rendering a branch off the page until it resolves, and a part
// moving to another component in one update.
import { afterEach, expect, test, vi } from "vitest"
import {
  createApp,
  defineAsyncComponent,
  defineComponent,
  h,
  KeepAlive,
  nextTick,
  ref,
  shallowRef,
  Suspense,
  type App,
} from "vue"
import { createAgent } from "@ui-sdk/core/agent"
import { Command, CommandGroup, CommandItem, CommandList } from "../src/command"
import {
  createDialogController,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../src/dialog"
import { Tabs, TabsList, TabsTab } from "../src/tabs"

Element.prototype.getAnimations ??= () => []
// jsdom has no top layer. With one, popups render in place, as in a browser.
HTMLElement.prototype.showPopover ??= function (this: HTMLElement) {
  this.toggleAttribute("data-top-layer", true)
}
HTMLElement.prototype.hidePopover ??= function (this: HTMLElement) {
  this.removeAttribute("data-top-layer")
}

// Before anything renders, so it hears every instance.
const agent = createAgent()

let app: App | undefined
afterEach(() => {
  vi.restoreAllMocks()
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
  document.documentElement.removeAttribute("style")
})

function mount(render: () => unknown) {
  const el = document.body.appendChild(document.createElement("div"))
  app = createApp(defineComponent({ setup: () => render }))
  app.mount(el)
  return el
}

// A modal locks the page a frame after it shows, so a check waits for that frame.
const wait = (ms = 10) =>
  new Promise((done) => requestAnimationFrame(() => setTimeout(done, ms)))
const locked = () => document.documentElement.style.overflow === "hidden"

const OpenDialog = defineComponent({
  setup: () => () =>
    h(Dialog, { defaultOpen: true }, () =>
      h(DialogContent, null, () => h(DialogTitle, null, () => "Settings"))
    ),
})

const Other = defineComponent({ setup: () => () => h("p", "Other page") })

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const shown = () => !!dialog()?.hasAttribute("data-top-layer")

// A page under a <KeepAlive>, and a switch to another page and back.
function cachedPage(render: () => unknown) {
  const page = ref<"cached" | "other">("cached")
  const Cached = defineComponent({ setup: () => render })
  mount(() =>
    h(KeepAlive, null, [page.value === "cached" ? h(Cached) : h(Other)])
  )
  return async (to: "cached" | "other") => {
    page.value = to
    await nextTick()
    await wait()
  }
}

// Content rendered in place goes with its page. Content rendered into a
// container is in a Teleport, which leaves its content there unless told.
const placements = [
  { placement: "in place", container: () => undefined },
  { placement: "in the body", container: () => document.body },
]

const settings = (options: object, container?: Element) =>
  h(Dialog, options, () =>
    h(DialogContent, { container }, () =>
      h(DialogTitle, null, () => "Settings")
    )
  )

test.each(placements)(
  "a cached page's open dialog rendered $placement leaves the page while away, and comes back",
  async ({ container }) => {
    const go = cachedPage(() => settings({ defaultOpen: true }, container()))
    await wait()
    expect(shown()).toBe(true)
    expect(locked()).toBe(true)
    for (const cycle of [1, 2]) {
      await go("other")
      expect(dialog(), `away ${cycle}`).toBe(null)
      expect(locked(), `away ${cycle}`).toBe(false)
      await go("cached")
      expect(shown(), `back ${cycle}`).toBe(true)
      expect(locked(), `back ${cycle}`).toBe(true)
    }
  }
)

test.each(placements)(
  "a cached dialog rendered $placement goes into the top layer once each time its page comes back, from where it renders",
  async ({ container }) => {
    // Where the dialog was each time it went into the top layer. A browser
    // takes a popup out of the top layer when it moves, so it must already be
    // where it renders.
    const shownFrom: (Element | null)[] = []
    vi.spyOn(HTMLElement.prototype, "showPopover").mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.getAttribute("role") === "dialog") {
        shownFrom.push(this.parentElement)
      }
      this.toggleAttribute("data-top-layer", true)
    })
    const go = cachedPage(() => settings({ defaultOpen: true }, container()))
    await wait()
    const where = dialog()!.parentElement
    await go("other")
    await go("cached")
    expect(shownFrom).toEqual([where, where])
  }
)

test.each(placements)(
  "a dialog rendered $placement that opens while its page is away shows once the page comes back",
  async ({ container }) => {
    const controller = createDialogController()
    const go = cachedPage(() => settings({ controller }, container()))
    await go("other")
    controller.open()
    await wait()
    expect(dialog()).toBe(null)
    expect(locked()).toBe(false)
    await go("cached")
    expect(shown()).toBe(true)
    expect(locked()).toBe(true)
  }
)

test.each(placements)(
  "an open dialog rendered $placement that mounts while its page is away shows once the page comes back",
  async ({ container }) => {
    const mounted = ref(false)
    const go = cachedPage(() =>
      mounted.value ? settings({ defaultOpen: true }, container()) : null
    )
    await go("other")
    mounted.value = true
    await wait()
    expect(dialog()).toBe(null)
    expect(locked()).toBe(false)
    await go("cached")
    expect(shown()).toBe(true)
    expect(locked()).toBe(true)
  }
)

test("an open dialog in a <Suspense> branch opens once the branch resolves", async () => {
  let resolve = () => {}
  const loaded = new Promise<void>((done) => (resolve = done))
  const Slow = defineAsyncComponent(() =>
    loaded.then(() => defineComponent({ setup: () => () => h("p", "Loaded") }))
  )
  mount(() =>
    h(Suspense, null, {
      default: () => h("div", [h(OpenDialog), h(Slow)]),
      fallback: () => h("p", "Loading"),
    })
  )
  await wait()
  expect(locked()).toBe(false)
  resolve()
  await wait(30)
  expect(document.body.textContent).toContain("Loaded")
  expect(locked()).toBe(true)
  expect(
    document.querySelector('[role="dialog"]')?.hasAttribute("data-top-layer")
  ).toBe(true)
})

const CachedTabs = defineComponent({
  setup: () => () =>
    h(Tabs, { defaultValue: "account" }, () =>
      h(TabsList, { "aria-label": "Settings" }, () => [
        h(TabsTab, { value: "account" }, () => "Account"),
        h(TabsTab, { value: "billing" }, () => "Billing"),
      ])
    ),
})

test("the agent sees a cached page's components as off the page while it's away", async () => {
  const page = ref<"tabs" | "other">("tabs")
  mount(() =>
    h(KeepAlive, null, [page.value === "tabs" ? h(CachedTabs) : h(Other)])
  )
  const tabs = () =>
    agent.snapshot().find((component) => component.component === "tabs")
  expect(tabs()?.offPage).toBeFalsy()
  page.value = "other"
  await nextTick()
  expect(tabs()?.offPage ?? true).toBe(true)
  page.value = "tabs"
  await nextTick()
  expect(tabs()?.offPage).toBeFalsy()
})

// Groups keyed by index, as a list rendered from filtered data can be: the
// first group's component now renders Profile, and the second one's goes. Vue
// mounts the new Profile before it unmounts the old one, which hands its ref
// null afterwards, and that mustn't unbind the element that took its place.
test("a part that moves to another component in one update stays bound", async () => {
  const groups = ref([["copy", "paste"], ["profile"]])
  const el = mount(() =>
    h(Command, { value: "profile" }, () =>
      h(CommandList, null, () =>
        groups.value.map((items, index) =>
          h(CommandGroup, { key: index }, () =>
            items.map((value) =>
              h(CommandItem, { key: value, value }, () => value)
            )
          )
        )
      )
    )
  )
  await nextTick()
  groups.value = [["profile"]]
  await nextTick()
  const profile = el.querySelector('[role="option"]')!
  expect(profile.textContent).toBe("profile")
  expect(profile.hasAttribute("data-highlighted")).toBe(true)
  expect(profile.getAttribute("aria-selected")).toBe("true")
})

// A trigger binds again to a new controller's dialog, and its old dialog lets go of it.
test("a trigger given another controller opens that controller's dialog and lets go of the first", async () => {
  const first = createDialogController()
  const second = createDialogController()
  const controller = shallowRef(first)
  // Non-modal, since a modal dialog's trigger leaves `aria-expanded` out.
  const el = mount(() => [
    h(Dialog, { controller: first, modal: false }, () =>
      h(DialogContent, null, () => "First")
    ),
    h(Dialog, { controller: second, modal: false }, () =>
      h(DialogContent, null, () => "Second")
    ),
    h(DialogTrigger, { controller: controller.value }, () => "Open"),
  ])
  await wait()
  controller.value = second
  await wait()
  const trigger = el.querySelector("button")!
  first.open()
  await wait()
  expect(trigger.getAttribute("aria-expanded")).toBe("false")
  first.close()
  trigger.click()
  await wait()
  expect(second.isOpen()).toBe(true)
  expect(first.isOpen()).toBe(false)
})
