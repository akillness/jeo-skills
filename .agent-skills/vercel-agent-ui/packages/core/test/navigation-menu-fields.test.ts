// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { navigationMenu } from "../src/components/navigation-menu/navigation-menu"
import { createFocus } from "../src/components/navigation-menu/navigation-menu-focus"
import { mount } from "../src/testing/mount"

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

function mountPanel(html: string) {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    {},
  ] as unknown as DOMRectList)
  const panel = document.createElement("div")
  panel.setAttribute("data-slot", "navigation-menu-content")
  panel.innerHTML = html
  document.body.append(panel)
  const focus = createFocus({
    orientation: () => "horizontal",
    value: () => "a",
    list: () => undefined,
    triggers: () => [],
    links: () => [],
    trigger: () => undefined,
    content: () => panel,
    panel: () => panel,
    open: () => {},
  })
  panel.addEventListener("keydown", (event) => focus.panelKeydown(event, panel))
  return panel
}

test("keys in a text field inside a panel move its caret, not focus", () => {
  const panel = mountPanel(
    '<a href="#a">A</a><input aria-label="Search" value="docs"><a href="#b">B</a>'
  )
  const input = panel.querySelector("input")!
  input.focus()
  for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(input)
  }
})

test("keys in a text field inside a focusable shadow host move its caret, not focus", () => {
  const panel = mountPanel(
    '<a href="#a">A</a><x-field tabindex="0"></x-field><a href="#b">B</a>'
  )
  const host = panel.querySelector("x-field")!
  const input = host
    .attachShadow({ mode: "open", delegatesFocus: true })
    .appendChild(document.createElement("input"))
  input.focus()
  const event = new KeyboardEvent("keydown", {
    key: "ArrowLeft",
    bubbles: true,
    cancelable: true,
    composed: true,
  })
  input.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
  expect(host.shadowRoot!.activeElement).toBe(input)
})

test('arrow keys on a contenteditable="False" tab stop inside a panel still move to the next link', () => {
  const panel = mountPanel(
    '<a href="#a">A</a><span tabindex="0" contenteditable="False">Note</span><a href="#b">B</a>'
  )
  panel.querySelector("span")!.focus()
  const event = new KeyboardEvent("keydown", {
    key: "ArrowDown",
    bubbles: true,
    cancelable: true,
  })
  document.activeElement!.dispatchEvent(event)
  expect(document.activeElement).toBe(panel.querySelector('a[href="#b"]'))
})

test("every panel key on a checkbox or button input does what it does on a link", () => {
  for (const key of [
    "ArrowDown",
    "ArrowUp",
    "ArrowLeft",
    "ArrowRight",
    "Home",
    "End",
  ]) {
    const handled = (markup: string, selector: string) => {
      const panel = mountPanel(`<a href="#a">A</a>${markup}<a href="#b">B</a>`)
      panel.querySelector<HTMLElement>(selector)!.focus()
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      })
      document.activeElement!.dispatchEvent(event)
      panel.remove()
      return event.defaultPrevented
    }
    const onLink = handled('<a href="#c">C</a>', 'a[href="#c"]')
    for (const type of ["checkbox", "submit", "button"]) {
      expect([
        key,
        type,
        handled(`<input type="${type}" aria-label="Pick">`, "input"),
      ]).toEqual([key, type, onLink])
    }
  }
})

test("arrow keys on a checkbox or button input inside a panel still move to the next link", () => {
  for (const type of ["checkbox", "submit", "button"]) {
    const panel = mountPanel(
      `<a href="#a">A</a><input type="${type}" aria-label="Pick"><a href="#b">B</a>`
    )
    panel.querySelector("input")!.focus()
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    })
    document.activeElement!.dispatchEvent(event)
    expect(document.activeElement).toBe(panel.querySelector('a[href="#b"]'))
    panel.remove()
  }
})

test("Tab while an input method composes in a field inside the viewport stays in the field", () => {
  const view = mount(
    navigationMenu,
    { defaultValue: "learn" },
    `<root aria-label="Main"><list>
      <item value="learn"><trigger>Learn</trigger></item>
      <item value="about"><button>About</button></item>
    </list><viewport><content value="learn"><link href="/docs">Docs</link><input aria-label="Search"></content></viewport></root>`
  )
  const input = view.root.querySelector("input")!
  input.focus()
  for (const composing of [{ isComposing: true }, { keyCode: 229 }]) {
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
      ...composing,
    })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(input)
    expect(view.state.value).toBe("learn")
  }
  view.unmount()
})
