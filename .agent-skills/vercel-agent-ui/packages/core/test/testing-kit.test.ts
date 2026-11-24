// @vitest-environment jsdom
// The testing kit, driving real primitives the way its docs show: from
// markup, with a person's keys and pointer.
import { afterEach, expect, test } from "vitest"
import { dialog } from "../src/components/dialog/dialog"
import { menu } from "../src/components/menu/menu"
import { radioGroup } from "../src/components/radio/radio"
import { slider } from "../src/components/slider/slider"
import { tabs } from "../src/components/tabs/tabs"
import { toolbar } from "../src/components/toolbar/toolbar"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { announce } from "../src/foundation/platform/announce"
import { checkDirection, checkServer, mount } from "../src/testing"
import { sortable } from "../../../examples/experiments/sortable"

const mounts: { unmount: () => void }[] = []
afterEach(() => mounts.splice(0).forEach((mounted) => mounted.unmount()))

test("tabs move with the arrow keys, as a person's keyboard changes", async () => {
  const view = mount(
    tabs,
    { defaultValue: "a" },
    `<root>
      <list aria-label="Settings">
        <tab value="a">Account</tab>
        <tab value="b">Password</tab>
      </list>
      <panel value="a">Account panel</panel>
      <panel value="b">Password panel</panel>
    </root>`
  )
  mounts.push(view)
  await view.keys("Tab")
  expect(document.activeElement).toBe(view.part("tab", "a"))
  await view.keys("ArrowRight")
  expect(view.state.value).toBe("b")
  expect(view.changes.at(-1)).toMatchObject({
    key: "value",
    value: "b",
    reason: "list-navigation",
    source: "keyboard",
  })
  expect(view.part("panel", "b")?.isConnected).toBe(true)
  expect(view.part("panel", "a")?.isConnected).toBe(false)
})

test("a click selects with the mouse as its source", async () => {
  const view = mount(
    tabs,
    { defaultValue: "a" },
    `<root><list><tab value="a">A</tab><tab value="b">B</tab></list></root>`
  )
  mounts.push(view)
  await view.click(view.part("tab", "b")!)
  expect(view.changes.at(-1)).toMatchObject({
    key: "value",
    value: "b",
    source: "mouse",
  })
})

test("Enter on a button clicks it with the keyboard as its source", async () => {
  const view = mount(
    menu,
    {},
    `<root><trigger>Actions</trigger><content aria-label="Actions"><item value="a">A</item></content></root>`
  )
  mounts.push(view)
  await view.keys("Tab", "Enter")
  expect(view.state.open).toBe(true)
  expect(view.changes.find((change) => change.key === "open")).toMatchObject({
    source: "keyboard",
  })
})

test("Tab from elsewhere in the page goes into the markup", async () => {
  const before = Object.assign(document.createElement("button"), {
    textContent: "Before",
  })
  const between = Object.assign(document.createElement("button"), {
    textContent: "Between",
  })
  document.body.prepend(before, between)
  before.focus()
  const view = mount(
    tabs,
    { defaultValue: "a" },
    `<root><list aria-label="Settings"><tab value="a">A</tab></list></root>`
  )
  mounts.push(view)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(view.part("tab", "a"))
  } finally {
    before.remove()
    between.remove()
  }
})

test("a playlist reorders from the keyboard and announces it", async () => {
  const list = mount(
    sortable,
    { defaultValue: ["intro", "verse", "chorus"] },
    `<root aria-label="Playlist">
      <item value="intro">Intro</item>
      <item value="verse">Verse</item>
      <item value="chorus">Chorus</item>
    </root>`
  )
  mounts.push(list)
  await list.keys("Tab", "Space", "ArrowDown", "Space")
  expect(list.state.value).toEqual(["verse", "intro", "chorus"])
  expect(list.changes.at(-1)).toMatchObject({
    key: "value",
    reason: "move-key",
    source: "keyboard",
  })
  expect(list.announced.at(-1)).toBe("Dropped Intro at position 2 of 3.")
})

test("a playlist reorders by a drag past the threshold", async () => {
  const list = mount(
    sortable,
    { defaultValue: ["intro", "verse", "chorus"] },
    `<root aria-label="Playlist"><item value="intro">Intro</item><item value="verse">Verse</item><item value="chorus">Chorus</item></root>`
  )
  mounts.push(list)
  await list.drag(list.part("item", "chorus")!, {
    to: list.part("item", "intro")!,
  })
  expect(list.state.value).toEqual(["chorus", "intro", "verse"])
  expect(list.changes.at(-1)).toMatchObject({
    key: "value",
    reason: "drag",
    source: "mouse",
  })
})

const tabsMarkup = `<root><list aria-label="Settings"><tab value="a">Account</tab><tab value="b">Password</tab><tab value="c">Billing</tab></list><panel value="a">A</panel><panel value="b">B</panel><panel value="c">C</panel></root>`

test("tabs render on a server from state alone", () => {
  const html = checkServer(tabs, { defaultValue: "b" }, tabsMarkup)
  expect(html).toContain('role="tablist"')
  expect(html).toContain('aria-selected="true"')
  expect(html).not.toContain(">A</div>")
})

test("checkServer names a part whose attributes read the clock or an option", () => {
  const clocked = definePrimitive({
    name: "clocked",
    options: { label: "string" },
    state: (_options: { label?: string }) => ({}),
    api: (context) => ({ label: () => context.options().label }),
    slots: (slot) => ({
      root: slot({ attrs: () => ({ "data-at": String(Date.now()) }) }),
      title: slot({ attrs: (state, { api }) => ({ title: api.label() }) }),
    }),
  })
  expect(() =>
    checkServer(clocked, { label: "Hi" }, `<root><title>T</title></root>`)
  ).toThrow(
    /`root` reads the clock or randomness \(`Date.now`\)[\s\S]*`title` reads option `label`/
  )
})

test("checkServer fails a primitive whose state starts from randomness or the window", () => {
  const starting = (initial: () => string) =>
    definePrimitive({
      name: "starting",
      state: () => ({ value: initial() }),
      api: () => ({}),
      slots: (slot) => ({
        root: slot({ attrs: (state) => ({ "data-value": state.value }) }),
      }),
    })
  expect(() =>
    checkServer(
      starting(() => String(Math.random())),
      {},
      `<root></root>`
    )
  ).toThrow(/creating it reads the clock or randomness \(`Math.random`\)/)
  const where = starting(() =>
    typeof window === "undefined" ? "server" : "browser"
  )
  expect(() => checkServer(where, {}, `<root></root>`)).toThrow(
    /creating it reads `window`/
  )
})

test("tabs follow the reading direction", async () => {
  await checkDirection(tabs, { defaultValue: "a" }, tabsMarkup)
})

// The kit found that the sortable's arrows never moved focus in a list: its
// `move` only handled grids, and a `move` replaces the arrow keys.
test("a horizontal playlist follows the reading direction", async () => {
  await checkDirection(
    sortable,
    { defaultValue: ["intro", "verse", "chorus"], orientation: "horizontal" },
    `<root aria-label="Playlist"><item value="intro">Intro</item><item value="verse">Verse</item><item value="chorus">Chorus</item></root>`
  )
})

test("checkDirection fails when arrows ignore the direction", async () => {
  const fixed = definePrimitive({
    name: "fixed",
    state: () => ({ index: 0 }),
    api: () => ({}),
    slots: (slot) => ({
      root: slot({
        attrs: () => ({ tabindex: "0", role: "slider" }),
        on: {
          keydown: (event, { store }) => {
            if (event.key === "ArrowRight") {
              store.set({ index: store.get().index + 1 })
            }
            if (event.key === "ArrowLeft") {
              store.set({ index: store.get().index - 1 })
            }
          },
        },
      }),
    }),
  })
  await expect(checkDirection(fixed, {}, `<root></root>`)).rejects.toThrow(
    /ArrowLeft right to left leaves state/
  )
})

test("a slider and a dialog render on a server from state alone", () => {
  const sliderHtml = checkServer(
    slider,
    { defaultValue: 40 },
    `<root><control><track><indicator></indicator><thumb index="0"><thumb-input aria-label="Volume"></thumb-input></thumb></track></control></root>`
  )
  expect(sliderHtml).toMatch(/type="range"[^>]*value="40"/)
  const dialogHtml = checkServer(
    dialog,
    { defaultOpen: true },
    `<trigger>Edit</trigger><content><title>Edit profile</title><description>Make changes.</description><close>Done</close></content>`
  )
  expect(dialogHtml).toContain('role="dialog"')
})

// The kit found an open dialog's content linking its title only once the
// title bound, so the server's HTML had a dialog with no name until hydration.
test("an open dialog is named on the server", () => {
  const html = checkServer(
    dialog,
    { defaultOpen: true },
    `<trigger>Edit</trigger><content><title>Edit profile</title><close>Done</close></content>`
  )
  expect(html).toMatch(/role="dialog"[^>]*aria-labelledby=/)
})

// The kit found a menu's trigger reading the internal `menubar` option while
// it rendered its attributes, where attributes read state alone.
test("a menu renders on a server from state alone", () => {
  checkServer(
    menu,
    { defaultOpen: true },
    `<trigger>Actions</trigger><content><item value="rename">Rename</item><item value="delete">Delete</item></content>`
  )
})

test("a slider follows the reading direction", async () => {
  await checkDirection(
    slider,
    { defaultValue: 40 },
    `<root><control><track><thumb index="0"><thumb-input aria-label="Volume"></thumb-input></thumb></track></control></root>`
  )
})

test("a dialog with no title is named by its trigger once mounted, and points at no title", async () => {
  const view = mount(
    dialog,
    { defaultOpen: true },
    `<trigger>Edit profile</trigger><content><close>Done</close></content>`
  )
  mounts.push(view)
  await view.settle()
  const content = view.part("content")!
  expect(content.getAttribute("aria-labelledby")).toBeNull()
  expect(content.getAttribute("aria-label")).toBe("Edit profile")
})

const failing = (where: "state" | "attrs" | "bind") =>
  definePrimitive({
    name: "failing",
    state: () => {
      if (where === "state") {
        throw new Error("broken state")
      }
      return {}
    },
    api: () => ({}),
    slots: (slot) => ({
      root: slot({
        attrs: () => {
          if (where === "attrs") {
            throw new Error("broken attrs")
          }
          return {}
        },
        bind: () => {
          if (where === "bind") {
            throw new Error("broken bind")
          }
        },
      }),
    }),
  })

test("a mount that throws leaves no markup and gives announcements back to the page", () => {
  for (const where of ["state", "attrs", "bind"] as const) {
    expect(() => mount(failing(where), {}, `<root>A</root>`)).toThrow(
      `broken ${where}`
    )
    expect(document.body.querySelector("[data-slot]")).toBeNull()
  }
  announce("Saved")
  expect(document.querySelector("[data-ui-sdk-announcer]")).not.toBeNull()
})

test("unmount runs every step when a cleanup throws, once", () => {
  let destroyed = 0
  const leaky = definePrimitive({
    name: "leaky",
    state: () => ({}),
    api: (context) => {
      context.onDestroy(() => destroyed++)
      return {}
    },
    slots: (slot) => ({
      root: slot({
        bind: () => () => {
          throw new Error("broken cleanup")
        },
      }),
    }),
  })
  const view = mount(leaky, {}, `<root>A</root>`)
  expect(() => view.unmount()).toThrow("broken cleanup")
  expect(destroyed).toBe(1)
  expect(view.root.isConnected).toBe(false)
  expect(() => view.unmount()).not.toThrow()
  announce("Saved")
  expect(document.querySelector("[data-ui-sdk-announcer]")).not.toBeNull()
})

test("checkDirection puts the page's direction back when mounting throws", async () => {
  await expect(
    checkDirection(failing("bind"), {}, `<root></root>`)
  ).rejects.toThrow("broken bind")
  expect(document.documentElement.getAttribute("dir")).toBeNull()
})

test("checks of the reading direction at once each get the page to themselves", async () => {
  document.documentElement.setAttribute("dir", "ltr")
  try {
    await Promise.all([
      checkDirection(tabs, { defaultValue: "a" }, tabsMarkup),
      checkDirection(tabs, { defaultValue: "b" }, tabsMarkup),
    ])
    expect(document.documentElement.getAttribute("dir")).toBe("ltr")
  } finally {
    document.documentElement.removeAttribute("dir")
  }
})

test("a toolbar follows the reading direction, though its tab stop is a generated id", async () => {
  await checkDirection(
    toolbar,
    {},
    `<root aria-label="Format"><button>Bold</button><button>Italic</button><button>Underline</button></root>`
  )
})

test("checkDirection compares values named left and right as they are", async () => {
  await checkDirection(
    radioGroup,
    { defaultValue: "center" },
    `<group aria-label="Align"><root value="left">Left</root><root value="center">Center</root><root value="right">Right</root></group>`
  )
  const aligned = definePrimitive({
    name: "aligned",
    state: () => ({ align: "center" }),
    api: () => ({}),
    slots: (slot) => ({
      root: slot({
        attrs: () => ({ tabindex: "0" }),
        on: {
          keydown: (event, { store }) => {
            if (event.key === "ArrowRight") {
              store.set({ align: "right" })
            }
            if (event.key === "ArrowLeft") {
              store.set({ align: "left" })
            }
          },
        },
      }),
    }),
  })
  await expect(checkDirection(aligned, {}, `<root></root>`)).rejects.toThrow(
    /ArrowLeft right to left leaves state/
  )
})

test("checkServer fails a primitive whose state reads the clock with new Date, randomness from crypto or the location", () => {
  const starting = (initial: () => string) =>
    definePrimitive({
      name: "starting",
      state: () => ({ value: initial() }),
      api: () => ({}),
      slots: (slot) => ({
        root: slot({ attrs: (state) => ({ "data-value": state.value }) }),
      }),
    })
  const reads = (initial: () => string) => () =>
    checkServer(starting(initial), {}, `<root></root>`)
  expect(reads(() => new Date().toISOString())).toThrow(
    /creating it reads the clock or randomness \(`new Date\(\)`\)/
  )
  expect(reads(() => Date())).toThrow(/\(`Date\(\)`\)/)
  expect(reads(() => crypto.randomUUID())).toThrow(/\(`crypto.randomUUID`\)/)
  expect(
    reads(() => String(crypto.getRandomValues(new Uint8Array(1))[0]))
  ).toThrow(/\(`crypto.getRandomValues`\)/)
  expect(reads(() => typeof location)).toThrow(/creating it reads `location`/)
  expect(reads(() => new Date(0).toISOString())()).toContain(
    'data-value="1970-01-01T00:00:00.000Z"'
  )
  expect(new Date().getTime()).toBeGreaterThan(0)
  expect(crypto.randomUUID()).toHaveLength(36)
})
