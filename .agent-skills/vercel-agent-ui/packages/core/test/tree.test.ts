// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  attrs,
  bind,
  liveAttrs,
  partState,
  present,
} from "../src/foundation/kernel/part"
import { applyAttrs } from "../src/foundation/kernel/live"
import type { PrimitiveInstance } from "../src/foundation/kernel/primitive-types"
import {
  createTreeController,
  tree,
  type TreeItemData,
  type TreeOptions,
} from "../src/components/tree/tree"
import { expectNoMissedUpdates } from "./selects"

type Node = {
  value: string
  children?: Node[]
  branch?: boolean
  disabled?: boolean
}

const files: Node[] = [
  {
    value: "src",
    children: [
      { value: "index.ts" },
      { value: "lib", children: [{ value: "util.ts" }, { value: "math.ts" }] },
    ],
  },
  { value: "docs", children: [{ value: "intro.md" }] },
  { value: "README.md" },
]

const data: TreeItemData[] = [
  {
    value: "src",
    label: "src",
    children: [
      { value: "index.ts", label: "index.ts" },
      {
        value: "lib",
        label: "lib",
        children: [
          { value: "util.ts", label: "util.ts" },
          { value: "math.ts", label: "math.ts" },
        ],
      },
    ],
  },
  {
    value: "docs",
    label: "docs",
    children: [{ value: "intro.md", label: "intro.md" }],
  },
  { value: "README.md", label: "README.md" },
]

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})

const tick = () => new Promise((resolve) => setTimeout(resolve))

// A stand-in adapter: renders composed items, labels and groups, keeps their
// attributes current, and binds them. Groups always render, hidden while collapsed.
function render(options: TreeOptions = {}, nodes: Node[] = files) {
  const instance = tree({ id: "t", ...options }) as ReturnType<typeof tree> &
    PrimitiveInstance
  const root = document.createElement("div")
  const rootPart = instance.part("root", {})
  const write = (part: Parameters<typeof attrs>[0], el: HTMLElement) => {
    const update = () => applyAttrs(el, attrs(part))
    update()
    cleanups.push(instance.subscribe(update))
  }
  write(rootPart, root)
  const els = new Map<string, HTMLElement>()
  const add = (list: Node[], parent: string | null, into: HTMLElement) => {
    for (const node of list) {
      const branch = node.branch ?? !!node.children
      const props = {
        value: node.value,
        parent,
        branch,
        disabled: node.disabled,
      }
      const el = document.createElement("div")
      const label = document.createElement("span")
      label.textContent = node.value
      el.append(label)
      write(instance.part("item", props), el)
      write(instance.part("label", { value: node.value }), label)
      into.append(el)
      els.set(node.value, el)
      if (node.children) {
        const group = document.createElement("div")
        write(instance.part("group", { value: node.value }), group)
        el.append(group)
        add(node.children, node.value, group)
      }
    }
  }
  add(nodes, null, root)
  document.body.append(root)
  cleanups.push(bind(rootPart, root))
  const bindAll = (list: Node[], parent: string | null) => {
    for (const node of list) {
      const branch = node.branch ?? !!node.children
      const props = {
        value: node.value,
        parent,
        branch,
        disabled: node.disabled,
      }
      cleanups.push(bind(instance.part("item", props), els.get(node.value)!))
      cleanups.push(
        bind(
          instance.part("label", { value: node.value }),
          els.get(node.value)!.firstElementChild as HTMLElement
        )
      )
      if (node.children) {
        bindAll(node.children, node.value)
      }
    }
  }
  bindAll(nodes, null)
  const key = (key: string, init: KeyboardEventInit = {}) =>
    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      })
    )
  const focused = () =>
    (document.activeElement as HTMLElement).firstElementChild?.textContent
  const stops = () =>
    [...els.entries()]
      .filter(([, el]) => el.getAttribute("tabindex") === "0")
      .map(([value]) => value)
  return { instance, els, key, focused, stops }
}

describe("server markup", () => {
  test("data gives every item its level and place among its siblings", () => {
    const instance = tree({ id: "t", items: data, defaultExpanded: ["src"] })
    const lib = attrs(instance.part("item", { value: "lib" }))
    expect(lib).toMatchObject({
      role: "treeitem",
      "aria-level": "2",
      "aria-posinset": "2",
      "aria-setsize": "2",
      "aria-expanded": "false",
      "aria-selected": "false",
      "data-branch": "",
      style: "--tree-level:2",
    })
    const readme = attrs(instance.part("item", { value: "README.md" }))
    expect(readme["aria-expanded"]).toBeUndefined()
    expect(readme["aria-posinset"]).toBe("3")
  })

  test("composed items take their level from the parents adapters pass", () => {
    const instance = tree({ id: "t" })
    instance.part("item", { value: "src", parent: null, branch: true })
    instance.part("item", { value: "lib", parent: "src", branch: true })
    expect(
      attrs(instance.part("item", { value: "util.ts", parent: "lib" }))[
        "aria-level"
      ]
    ).toBe("3")
  })

  test("the current item takes the stop, and its ancestors start expanded", () => {
    const instance = tree({
      id: "t",
      items: data,
      current: "util.ts",
      mode: "none",
    })
    expect(instance.api.getExpanded()).toEqual(["src", "lib"])
    const stop = ["src", "index.ts", "lib", "util.ts"].filter(
      (value) => attrs(instance.part("item", { value })).tabindex === "0"
    )
    expect(stop).toEqual(["util.ts"])
    expect(attrs(instance.part("item", { value: "util.ts" }))).toMatchObject({
      "aria-current": "page",
      "aria-selected": undefined,
    })
  })

  test("a selected item hidden in a collapsed branch leaves the stop on the first item", () => {
    const instance = tree({ id: "t", items: data, defaultValue: "util.ts" })
    const stop = ["src", "docs", "README.md"].filter(
      (value) => attrs(instance.part("item", { value })).tabindex === "0"
    )
    expect(stop).toEqual(["src"])
  })

  test("groups render only while expanded, unless kept mounted or findable", () => {
    const instance = tree({ id: "t", defaultExpanded: ["src"] })
    expect(present(instance.part("group", { value: "src" }))).toBe(true)
    expect(present(instance.part("group", { value: "docs" }))).toBe(false)
    const findable = tree({ id: "t", hiddenUntilFound: true })
    expect(attrs(findable.part("group", { value: "docs" }))).toMatchObject({
      role: "group",
      hidden: "until-found",
    })
  })
})

describe("selection", () => {
  test("one item's value is a string, and many are a list", () => {
    const single = vi.fn()
    const one = render({ onValueChange: single })
    one.els.get("README.md")!.click()
    expect(single).toHaveBeenLastCalledWith(
      "README.md",
      expect.objectContaining({ reason: "item-press" })
    )
    expect(one.instance.api.getValue()).toBe("README.md")
    expect(one.els.get("README.md")!.getAttribute("aria-selected")).toBe("true")

    const many = vi.fn()
    const multi = render({ mode: "multiple", onValueChange: many })
    multi.els.get("src")!.click()
    multi.els.get("README.md")!.click()
    expect(many).toHaveBeenLastCalledWith(
      ["src", "README.md"],
      expect.anything()
    )
  })

  test("Shift extends over the items that show, and Ctrl+A selects them all", async () => {
    const { instance, els, key } = render({
      mode: "multiple",
      defaultExpanded: ["src"],
    })
    await tick()
    els.get("src")!.focus()
    key("ArrowDown", { shiftKey: true })
    key("ArrowDown", { shiftKey: true })
    expect(instance.api.getValue()).toEqual(["src", "index.ts", "lib"])
    key("a", { ctrlKey: true })
    expect(instance.api.getValue()).toEqual([
      "src",
      "index.ts",
      "lib",
      "docs",
      "README.md",
    ])
  })

  test('with `activation: "automatic"`, focus selects', async () => {
    const { instance, els, key } = render({ activation: "automatic" })
    await tick()
    els.get("src")!.focus()
    key("ArrowDown")
    expect(instance.api.getValue()).toBe("docs")
  })

  test('with `activation: "automatic"`, Right into a branch, Left out of it and typing select too', async () => {
    const { instance, els, key, focused } = render({
      activation: "automatic",
      defaultExpanded: ["src"],
    })
    await tick()
    els.get("src")!.focus()
    key("ArrowRight")
    expect(focused()).toBe("index.ts")
    expect(instance.api.getValue()).toBe("index.ts")
    key("ArrowLeft")
    expect(focused()).toBe("src")
    expect(instance.api.getValue()).toBe("src")
    key("R", { shiftKey: true })
    expect(focused()).toBe("README.md")
    expect(instance.api.getValue()).toBe("README.md")
  })

  test('with `activation: "automatic"`, Right into a branch whose children are loading selects the first once it shows', async () => {
    let resolve = () => {}
    const loadChildren = vi.fn(
      () => new Promise<void>((done) => (resolve = done))
    )
    const { instance, els, key, focused } = render(
      { activation: "automatic", loadChildren },
      [{ value: "remote", branch: true }]
    )
    await tick()
    els.get("remote")!.focus()
    key("ArrowRight")
    key("ArrowRight")
    resolve()
    await tick()
    const child = document.createElement("div")
    child.tabIndex = -1
    const label = child.appendChild(document.createElement("span"))
    label.textContent = "child"
    els.get("remote")!.append(child)
    cleanups.push(
      bind(
        instance.part("item", {
          value: "child",
          parent: "remote",
          branch: false,
        }),
        child
      ),
      bind(instance.part("label", { value: "child" }), label)
    )
    await tick()
    expect(focused()).toBe("child")
    expect(instance.api.getValue()).toBe("child")
  })

  test('with `activation: "automatic"`, the child of a loading branch keeps the key press that stepped into it', async () => {
    let resolve = () => {}
    const loadChildren = vi.fn(
      () => new Promise<void>((done) => (resolve = done))
    )
    const onValueChange = vi.fn()
    const { instance, els, key } = render(
      { activation: "automatic", loadChildren, onValueChange },
      [{ value: "remote", branch: true }]
    )
    await tick()
    els.get("remote")!.focus()
    key("ArrowRight")
    key("ArrowRight")
    resolve()
    await tick()
    const child = document.createElement("div")
    child.tabIndex = -1
    const label = child.appendChild(document.createElement("span"))
    label.textContent = "child"
    els.get("remote")!.append(child)
    cleanups.push(
      bind(
        instance.part("item", {
          value: "child",
          parent: "remote",
          branch: false,
        }),
        child
      ),
      bind(instance.part("label", { value: "child" }), label)
    )
    await tick()
    expect(onValueChange).toHaveBeenLastCalledWith(
      "child",
      expect.objectContaining({
        event: expect.objectContaining({ key: "ArrowRight" }),
      })
    )
  })

  test('with `activation: "automatic"`, the child of a loading branch selects nothing once focus moved on', async () => {
    let resolve = () => {}
    const loadChildren = vi.fn(
      () => new Promise<void>((done) => (resolve = done))
    )
    const { instance, els, key } = render(
      { activation: "automatic", loadChildren },
      [{ value: "remote", branch: true }, { value: "other" }]
    )
    await tick()
    els.get("remote")!.focus()
    key("ArrowRight")
    key("ArrowRight")
    key("ArrowDown")
    expect(instance.api.getValue()).toBe("other")
    resolve()
    await tick()
    const child = document.createElement("div")
    child.tabIndex = -1
    const label = child.appendChild(document.createElement("span"))
    label.textContent = "child"
    els.get("remote")!.append(child)
    cleanups.push(
      bind(
        instance.part("item", {
          value: "child",
          parent: "remote",
          branch: false,
        }),
        child
      ),
      bind(instance.part("label", { value: "child" }), label)
    )
    await tick()
    expect(instance.api.getValue()).toBe("other")
  })

  test('with `activation: "automatic"`, the child of a loading branch selects nothing once focus left the tree', async () => {
    let resolve = () => {}
    const loadChildren = vi.fn(
      () => new Promise<void>((done) => (resolve = done))
    )
    const { instance, els, key } = render(
      { activation: "automatic", loadChildren },
      [{ value: "remote", branch: true }]
    )
    await tick()
    els.get("remote")!.focus()
    key("ArrowRight")
    key("ArrowRight")
    const before = instance.api.getValue()
    const outside = document.body.appendChild(document.createElement("button"))
    cleanups.push(() => outside.remove())
    outside.focus()
    resolve()
    await tick()
    const child = document.createElement("div")
    child.tabIndex = -1
    const label = child.appendChild(document.createElement("span"))
    label.textContent = "child"
    els.get("remote")!.append(child)
    cleanups.push(
      bind(
        instance.part("item", {
          value: "child",
          parent: "remote",
          branch: false,
        }),
        child
      ),
      bind(instance.part("label", { value: "child" }), label)
    )
    await tick()
    expect(instance.api.getValue()).toBe(before)
  })

  test('with `activation: "automatic"`, the child of a loading branch is selected inside a shadow root too', async () => {
    let resolve = () => {}
    const loadChildren = vi.fn(
      () => new Promise<void>((done) => (resolve = done))
    )
    const { instance, els } = render(
      { activation: "automatic", loadChildren },
      [{ value: "remote", branch: true }]
    )
    const remote = els.get("remote")!
    const host = document.body.appendChild(document.createElement("div"))
    cleanups.push(() => host.remove())
    host.attachShadow({ mode: "open" }).append(remote.parentElement!)
    await tick()
    remote.focus()
    const right = () =>
      remote.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
          cancelable: true,
        })
      )
    right()
    right()
    resolve()
    await tick()
    const child = document.createElement("div")
    child.tabIndex = -1
    const label = child.appendChild(document.createElement("span"))
    label.textContent = "child"
    remote.append(child)
    cleanups.push(
      bind(
        instance.part("item", {
          value: "child",
          parent: "remote",
          branch: false,
        }),
        child
      ),
      bind(instance.part("label", { value: "child" }), label)
    )
    await tick()
    expect(instance.api.getValue()).toBe("child")
  })

  test('with `activation: "automatic"`, collapsing a loading branch forgets the key press that stepped into it', async () => {
    let resolve = () => {}
    const loadChildren = vi.fn(
      () => new Promise<void>((done) => (resolve = done))
    )
    const { instance, els, key } = render(
      { activation: "automatic", loadChildren },
      [{ value: "remote", branch: true }]
    )
    await tick()
    els.get("remote")!.focus()
    key("ArrowRight")
    key("ArrowRight")
    const before = instance.api.getValue()
    instance.api.collapse("remote")
    instance.api.expand("remote")
    resolve()
    await tick()
    const child = document.createElement("div")
    child.tabIndex = -1
    const label = child.appendChild(document.createElement("span"))
    label.textContent = "child"
    els.get("remote")!.append(child)
    cleanups.push(
      bind(
        instance.part("item", {
          value: "child",
          parent: "remote",
          branch: false,
        }),
        child
      ),
      bind(instance.part("label", { value: "child" }), label)
    )
    await tick()
    expect(instance.api.getValue()).toBe(before)
  })

  test('`mode: "none"` writes no aria-selected and selects nothing', () => {
    const { instance, els } = render({ mode: "none" })
    els.get("README.md")!.click()
    expect(instance.api.getValue()).toBeNull()
    expect(els.get("README.md")!.hasAttribute("aria-selected")).toBe(false)
  })
})

describe("keyboard", () => {
  test("Right expands, then steps in; Left steps out, then collapses", async () => {
    const { instance, els, key, focused } = render()
    await tick()
    els.get("src")!.focus()
    key("ArrowRight")
    expect(instance.api.getExpanded()).toEqual(["src"])
    expect(focused()).toBe("src")
    await tick()
    key("ArrowRight")
    expect(focused()).toBe("index.ts")
    key("ArrowLeft")
    expect(focused()).toBe("src")
    key("ArrowLeft")
    expect(instance.api.getExpanded()).toEqual([])
  })

  test("a key on a child never reaches its parent's handler", async () => {
    const onAction = vi.fn()
    const { els, key } = render({ defaultExpanded: ["src"], onAction })
    await tick()
    els.get("index.ts")!.focus()
    key("Enter")
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith("index.ts", expect.anything())
    els.get("index.ts")!.click()
    expect(onAction).toHaveBeenCalledTimes(2)
    expect(onAction).toHaveBeenLastCalledWith("index.ts", expect.anything())
  })

  test("Up and Down skip items in collapsed branches; Home and End reach the ends", async () => {
    const { els, key, focused } = render({ defaultExpanded: ["src"] })
    await tick()
    els.get("src")!.focus()
    key("ArrowDown")
    key("ArrowDown")
    key("ArrowDown")
    expect(focused()).toBe("docs")
    key("End")
    expect(focused()).toBe("README.md")
    key("Home")
    expect(focused()).toBe("src")
  })

  test("`*` expands every sibling branch, and Alt+Right everything in one", async () => {
    const { instance, els, key } = render()
    await tick()
    els.get("src")!.focus()
    key("*")
    expect(instance.api.getExpanded()).toEqual(["src", "docs"])
    instance.api.collapseAll()
    key("ArrowRight", { altKey: true })
    expect(instance.api.getExpanded()).toEqual(["src", "lib"])
    key("ArrowLeft", { altKey: true })
    expect(instance.api.getExpanded()).toEqual([])
  })

  test("typeahead matches labels, never a branch's children", async () => {
    const { els, key, focused } = render({ defaultExpanded: ["src"] })
    await tick()
    els.get("src")!.focus()
    key("r")
    expect(focused()).toBe("README.md")
    key("Home")
    key("u")
    // util.ts is in a collapsed branch.
    expect(focused()).toBe("src")
  })

  test("right to left swaps Left and Right", async () => {
    const { instance, els, key } = render()
    await tick()
    document.body.dir = "rtl"
    els.get("src")!.focus()
    key("ArrowLeft")
    expect(instance.api.getExpanded()).toEqual(["src"])
    document.body.dir = ""
  })
})

describe("checkboxes", () => {
  test("a branch shows mixed while only some of it is checked", () => {
    const instance = tree({
      id: "t",
      items: data,
      checkable: true,
      mode: "none",
      defaultChecked: ["util.ts"],
    })
    expect(attrs(instance.part("item", { value: "lib" }))).toMatchObject({
      "aria-checked": "mixed",
      "data-indeterminate": "",
    })
    expect(
      partState(instance.part("checkbox", { value: "util.ts" }))
    ).toMatchObject({ checked: true })
    expect(
      attrs(instance.part("item", { value: "docs" }))["aria-checked"]
    ).toBe("false")
  })

  test("Space checks the focused item, and checking a branch checks what's in it", async () => {
    const onCheckedChange = vi.fn()
    const { instance, els, key } = render({
      checkable: true,
      mode: "none",
      onCheckedChange,
    })
    await tick()
    els.get("src")!.focus()
    key(" ")
    expect(onCheckedChange).toHaveBeenLastCalledWith(
      ["index.ts", "util.ts", "math.ts"],
      expect.objectContaining({ reason: "item-press" })
    )
    expect(instance.api.checkedState("lib")).toBe(true)
    expect(instance.api.getValue()).toBeNull()
  })

  test("disabled items keep their check", () => {
    const instance = tree({
      id: "t",
      items: [
        {
          value: "a",
          label: "A",
          children: [
            { value: "b", label: "B", disabled: true },
            { value: "c", label: "C" },
          ],
        },
      ],
      checkable: true,
      mode: "none",
    })
    instance.api.internal.pressCheckbox("a")
    expect(instance.api.getChecked()).toEqual(["c"])
    expect(instance.api.checkedState("a")).toBe("indeterminate")
  })

  test("development builds warn when checkboxes and a selection are both on", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    tree({ id: "t", checkable: true })
    expect(
      warn.mock.calls.some(([message]) =>
        String(message).includes("checked and selected")
      )
    ).toBe(true)
    warn.mockRestore()
  })
})

describe("composed positions", () => {
  test("items learn their place among their siblings once they're in the page", async () => {
    const { els } = render({ defaultExpanded: ["src"] })
    await tick()
    expect(els.get("lib")!.getAttribute("aria-posinset")).toBe("2")
    expect(els.get("lib")!.getAttribute("aria-setsize")).toBe("2")
    expect(els.get("README.md")!.getAttribute("aria-posinset")).toBe("3")
  })
})

describe("loading children", () => {
  test("a branch with no children loads them, then expands", async () => {
    let resolve = () => {}
    const loadChildren = vi.fn(
      () => new Promise<void>((done) => (resolve = done))
    )
    const { instance, els } = render({ loadChildren }, [
      { value: "remote", branch: true },
    ])
    await tick()
    els.get("remote")!.click()
    expect(loadChildren).toHaveBeenCalledWith("remote", {
      signal: expect.any(AbortSignal),
    })
    expect(els.get("remote")!.getAttribute("aria-busy")).toBe("true")
    expect(els.get("remote")!.hasAttribute("data-loading")).toBe(true)
    expect(instance.api.getExpanded()).toEqual([])
    resolve()
    await tick()
    expect(instance.api.getExpanded()).toEqual(["remote"])
    expect(els.get("remote")!.hasAttribute("data-loading")).toBe(false)
  })

  test("a failed load marks the branch, and the next expand tries again", async () => {
    const loadChildren = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined)
    const { instance, els } = render({ loadChildren }, [
      { value: "remote", branch: true },
    ])
    await tick()
    instance.api.expand("remote")
    await tick()
    expect(els.get("remote")!.hasAttribute("data-failed")).toBe(true)
    expect(instance.api.getExpanded()).toEqual([])
    instance.api.expand("remote")
    await tick()
    expect(loadChildren).toHaveBeenCalledTimes(2)
    expect(instance.api.getExpanded()).toEqual(["remote"])
    expect(els.get("remote")!.hasAttribute("data-failed")).toBe(false)
  })

  test("expanding again while loading cancels", async () => {
    let signal: AbortSignal | undefined
    const loadChildren = vi.fn(
      (_value: string, details: { signal: AbortSignal }) => {
        signal = details.signal
        return new Promise<void>(() => {})
      }
    )
    const { instance } = render({ loadChildren }, [
      { value: "remote", branch: true },
    ])
    instance.api.expand("remote")
    instance.api.expand("remote")
    expect(signal?.aborted).toBe(true)
    expect(instance.get().loading).toEqual([])
  })
})

describe("virtualized rows", () => {
  test("a key that moves past the rendered rows reports the row, and focus lands once it renders", async () => {
    const onHighlight = vi.fn()
    // Only the first row renders, as a virtualized list would.
    const { instance, els, key, focused } = render(
      { items: data, onHighlight },
      [{ value: "src" }]
    )
    await tick()
    els.get("src")!.focus()
    key("End")
    expect(onHighlight).toHaveBeenCalledWith("README.md", {
      index: 2,
      event: expect.any(KeyboardEvent),
    })
    const readme = document.createElement("div")
    readme.innerHTML = "<span>README.md</span>"
    document.querySelector('[role="tree"]')!.append(readme)
    const part = instance.part("item", { value: "README.md" })
    applyAttrs(readme, attrs(part))
    expect(readme.getAttribute("aria-posinset")).toBe("3")
    cleanups.push(bind(part, readme))
    await Promise.resolve()
    expect(focused()).toBe("README.md")
  })
})

describe("controller", () => {
  test("expands, collapses, reveals and focuses from outside", async () => {
    const controller = createTreeController()
    const { els, focused } = render({ controller })
    await tick()
    controller.expandAll()
    expect(controller.getExpanded()).toEqual(["src", "lib", "docs"])
    controller.collapseAll()
    controller.reveal("math.ts")
    expect(controller.getExpanded()).toEqual(["src", "lib"])
    await tick()
    expect(focused()).toBe("math.ts")
    controller.collapse("src")
    expect(controller.isExpanded("src")).toBe(false)
    expect(els.size).toBe(8)
  })
})

describe("controlled reveal", () => {
  test("focuses the item once a controlled tree's expanded value comes back", async () => {
    const controller = createTreeController()
    let expanded: string[] = []
    const options = (): TreeOptions & { id: string } => ({
      id: "t",
      controller,
      keepMounted: true,
      expanded,
      onExpandedChange: (next) => (expanded = next),
    })
    const { instance, focused } = render(options())
    await tick()
    controller.reveal("math.ts")
    expect(expanded).toEqual(["src", "lib"])
    await tick()
    expect(focused()).not.toBe("math.ts")
    instance.setOptions(options())
    await tick()
    expect(focused()).toBe("math.ts")
  })
})

describe("selects", () => {
  test("every item part hears the changes that touch it", async () => {
    const instance = tree({
      id: "t",
      items: data,
      checkable: true,
      mode: "multiple",
    }) as PrimitiveInstance
    const api = (instance as unknown as ReturnType<typeof tree>).api
    const parts = ["src", "lib", "util.ts", "README.md"].flatMap((value) => [
      { slot: "item", props: { value } },
      { slot: "label", props: { value } },
      { slot: "indicator", props: { value } },
      { slot: "checkbox", props: { value } },
      { slot: "group", props: { value } },
    ])
    await expectNoMissedUpdates(instance, parts, [
      ["expand", () => api.expand("src")],
      ["select", () => api.setValue(["lib"])],
      ["check", () => api.setChecked(["util.ts"])],
      ["collapse", () => api.collapse("src")],
    ])
    expect(liveAttrs(instance.part("item", { value: "src" }))).toEqual({})
  })
})
