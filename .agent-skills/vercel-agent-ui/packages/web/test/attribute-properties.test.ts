// @vitest-environment jsdom
// Every attribute option has a property that reflects it, the way a native
// element's do: booleans by presence, ones that start on as "true" or
// "false", like `spellcheck`, and the rest as text.
import { beforeAll, describe, expect, test } from "vitest"
import { defineDialogElements } from "../src/dialog"
import type {
  UiDialogElement,
  UiPaginationElement,
  UiTabsElement,
} from "../src/events"
import { definePaginationElements } from "../src/pagination"
import { defineTabsElements } from "../src/tabs"
import { defineToolbarElements } from "../src/toolbar"
import { defineTreeElements } from "../src/tree"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

// Made before its element is defined, with a property set on it then.
let early: HTMLElement & { pageCount?: number }

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  early = document.createElement("ui-pagination")
  early.pageCount = 50
  defineTabsElements()
  definePaginationElements()
  defineToolbarElements()
  defineTreeElements()
  defineDialogElements()
})

async function mount<T extends HTMLElement>(html: string) {
  document.body.innerHTML = html
  await wait()
  return document.body.firstElementChild as T
}

const tabsMarkup = `<ui-tabs value="a"><ui-tabs-list aria-label="Settings"><ui-tabs-tab value="a"><button>A</button></ui-tabs-tab></ui-tabs-list><ui-tabs-panel value="a">A</ui-tabs-panel></ui-tabs>`

describe("attribute properties", () => {
  test("a boolean that starts off goes by presence", async () => {
    const tabs = await mount<UiTabsElement>(tabsMarkup)
    expect(tabs.hiddenUntilFound).toBe(false)
    tabs.hiddenUntilFound = true
    expect(tabs.getAttribute("hidden-until-found")).toBe("")
    expect(tabs.hiddenUntilFound).toBe(true)
    tabs.hiddenUntilFound = false
    expect(tabs.hasAttribute("hidden-until-found")).toBe(false)
  })

  test('a boolean that starts on reads true, and false writes "false"', async () => {
    const tabs = await mount<UiTabsElement>(tabsMarkup)
    expect(tabs.loop).toBe(true)
    tabs.loop = false
    expect(tabs.getAttribute("loop")).toBe("false")
    expect(tabs.loop).toBe(false)
    tabs.loop = true
    expect(tabs.getAttribute("loop")).toBe("")
    expect(tabs.loop).toBe(true)
  })

  test("disabled is true whenever present, like a native control's", async () => {
    const toolbar = await mount(
      `<ui-toolbar aria-label="Format"><ui-toolbar-button><button>Bold</button></ui-toolbar-button></ui-toolbar>`
    )
    const button = toolbar.querySelector("ui-toolbar-button") as HTMLElement & {
      disabled: boolean
    }
    expect(button.disabled).toBe(false)
    button.setAttribute("disabled", "false")
    expect(button.disabled).toBe(true)
    button.disabled = false
    expect(button.hasAttribute("disabled")).toBe(false)
  })

  test("text reflects as written, and setting it reaches the component", async () => {
    const tabs = await mount<UiTabsElement>(tabsMarkup)
    expect(tabs.orientation).toBeUndefined()
    tabs.orientation = "vertical"
    expect(tabs.getAttribute("orientation")).toBe("vertical")
    expect(tabs.orientation).toBe("vertical")
    await wait()
    expect(
      tabs.querySelector("[role=tablist]")?.getAttribute("aria-orientation")
    ).toBe("vertical")
    tabs.orientation = undefined
    expect(tabs.hasAttribute("orientation")).toBe(false)
  })

  test("numbers read as numbers, and lists join with commas", async () => {
    const pagination = await mount<UiPaginationElement>(
      `<ui-pagination aria-label="Pages"></ui-pagination>`
    )
    pagination.pageCount = 5
    expect(pagination.getAttribute("page-count")).toBe("5")
    expect(pagination.pageCount).toBe(5)
    const tree = await mount<HTMLElement & { defaultExpanded?: string[] }>(
      `<ui-tree></ui-tree>`
    )
    tree.defaultExpanded = ["docs", "src"]
    expect(tree.getAttribute("default-expanded")).toBe("docs,src")
    expect(tree.defaultExpanded).toEqual(["docs", "src"])
  })

  test("parts have them too", async () => {
    const toolbar = await mount(
      `<ui-toolbar aria-label="Format"><ui-toolbar-button><button>Bold</button></ui-toolbar-button></ui-toolbar>`
    )
    const button = toolbar.querySelector("ui-toolbar-button") as HTMLElement & {
      focusableWhenDisabled: boolean
    }
    expect(button.focusableWhenDisabled).toBe(true)
    button.focusableWhenDisabled = false
    expect(button.getAttribute("focusable-when-disabled")).toBe("false")
  })

  test("a default that depends on another attribute reads like the component's", async () => {
    const dialog = await mount<UiDialogElement>(
      `<ui-dialog modal="false"></ui-dialog>`
    )
    expect(dialog.closeOnOutsidePress).toBe(false)
    dialog.closeOnOutsidePress = true
    expect(dialog.getAttribute("close-on-outside-press")).toBe("")
    dialog.removeAttribute("close-on-outside-press")
    dialog.modal = true
    expect(dialog.closeOnOutsidePress).toBe(true)
    dialog.closeOnOutsidePress = false
    expect(dialog.getAttribute("close-on-outside-press")).toBe("false")
  })

  test("a property set before the element is defined becomes its attribute", async () => {
    document.body.replaceChildren(early)
    await wait()
    expect(early.getAttribute("page-count")).toBe("50")
    expect(early.pageCount).toBe(50)
  })

  test("properties every element has stay native, like dir", async () => {
    const tabs = await mount<UiTabsElement>(tabsMarkup)
    tabs.dir = "rtl"
    expect(tabs.getAttribute("dir")).toBe("rtl")
    expect(
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(tabs), "dir")
    ).toBeUndefined()
  })
})

describe("the element's own api", () => {
  test("an owner exposes its controller's methods and keeps its instance private", async () => {
    const tabs = await mount<UiTabsElement>(tabsMarkup)
    expect(Object.keys(tabs.api!).sort()).toEqual([
      "focus",
      "getValue",
      "select",
      "setValue",
    ])
    expect("instance" in tabs).toBe(false)
  })
})
