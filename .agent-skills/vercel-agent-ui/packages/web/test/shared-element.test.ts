// @vitest-environment jsdom
// Of two components' parts on one element, the inner one names it, as the
// element passed to `render` does in the other frameworks.
import { expect, test } from "vitest"
import { defineMenuElements } from "../src/menu"
import { defineNumberInputElements } from "../src/number-input"
import { defineToolbarElements } from "../src/toolbar"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

test("a number input's control inside a toolbar input keeps its data-slot when either renders again", async () => {
  ElementInternals.prototype.setFormValue ??= () => {}
  ElementInternals.prototype.setValidity ??= () => {}
  defineToolbarElements()
  defineNumberInputElements()
  document.body.innerHTML = `
    <ui-toolbar aria-label="Text">
      <ui-number-input default-value="14">
        <ui-toolbar-input>
          <ui-number-input-control><input aria-label="Font size" /></ui-number-input-control>
        </ui-toolbar-input>
        <ui-number-input-increment><button aria-label="Increase font size">+</button></ui-number-input-increment>
      </ui-number-input>
      <ui-toolbar-input><input aria-label="Find" /></ui-toolbar-input>
    </ui-toolbar>`
  await wait()
  const [fontSize, find] = document.querySelectorAll("input")
  expect(fontSize.getAttribute("data-slot")).toBe("number-input-control")
  expect(find.getAttribute("data-slot")).toBe("toolbar-input")

  document
    .querySelector<HTMLButtonElement>('[aria-label="Increase font size"]')!
    .click()
  await wait()
  expect(fontSize.value).toBe("15")
  expect(fontSize.getAttribute("data-slot")).toBe("number-input-control")

  document.querySelector("ui-toolbar")!.setAttribute("orientation", "vertical")
  await wait()
  expect(fontSize.getAttribute("data-orientation")).toBe("vertical")
  expect(fontSize.getAttribute("data-slot")).toBe("number-input-control")
})

Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

const menu = `<ui-menu id="m"><ui-menu-content><ui-menu-item>Bold</ui-menu-item></ui-menu-content></ui-menu>`

async function renderToolbarMenu(toolbarAttributes = "") {
  defineToolbarElements()
  defineMenuElements()
  document.body.innerHTML = `
    <ui-toolbar aria-label="Text" ${toolbarAttributes}>
      <ui-toolbar-button><ui-menu-trigger for="m"><button>Format</button></ui-menu-trigger></ui-toolbar-button>
    </ui-toolbar>
    <div id="menus">${menu}</div>`
  await wait()
  const button = document.querySelector("button")!
  expect(button.getAttribute("data-slot")).toBe("menu-trigger")
  expect(button.getAttribute("aria-haspopup")).toBe("menu")
  return button
}

const renderToolbarAgain = async () => {
  document.querySelector("ui-toolbar")!.setAttribute("orientation", "vertical")
  await wait()
}

test("a toolbar button gets its own data-slot back when the menu its trigger names leaves the page", async () => {
  const button = await renderToolbarMenu()
  document.getElementById("m")!.remove()
  await wait()
  expect(button.hasAttribute("aria-haspopup")).toBe(false)
  expect(button.getAttribute("data-slot")).toBe("toolbar-button")
  await renderToolbarAgain()
  expect(button.getAttribute("data-slot")).toBe("toolbar-button")
})

test("a toolbar button gets its own data-slot back when its trigger's `for` stops naming a menu", async () => {
  const button = await renderToolbarMenu()
  document.querySelector("ui-menu-trigger")!.setAttribute("for", "missing")
  await wait()
  expect(button.hasAttribute("aria-haspopup")).toBe(false)
  expect(button.getAttribute("data-slot")).toBe("toolbar-button")
  await renderToolbarAgain()
  expect(button.getAttribute("data-slot")).toBe("toolbar-button")

  document.querySelector("ui-menu-trigger")!.setAttribute("for", "m")
  await wait()
  expect(button.getAttribute("aria-haspopup")).toBe("menu")
  await renderToolbarAgain()
  expect(button.getAttribute("data-slot")).toBe("menu-trigger")
})

test("a menu trigger keeps its data-slot when the toolbar button around it lets go first, and neither is left after both", async () => {
  const button = await renderToolbarMenu('id="toolbar"')
  const toolbarButton = document.querySelector("ui-toolbar-button")!
  toolbarButton.setAttribute("for", "toolbar")
  document.body.append(toolbarButton)
  await wait()
  toolbarButton.setAttribute("for", "missing")
  await wait()
  expect(button.hasAttribute("data-orientation")).toBe(false)
  expect(button.getAttribute("data-slot")).toBe("menu-trigger")
  expect(button.getAttribute("aria-haspopup")).toBe("menu")

  document.getElementById("m")!.remove()
  await wait()
  expect(button.hasAttribute("data-slot")).toBe(false)
})

test("a toolbar button and a menu trigger leave no data-slot when the trigger lets go first, then the button", async () => {
  const button = await renderToolbarMenu('id="toolbar"')
  const toolbarButton = document.querySelector("ui-toolbar-button")!
  toolbarButton.setAttribute("for", "toolbar")
  document.body.append(toolbarButton)
  await wait()
  document.getElementById("m")!.remove()
  await wait()
  expect(button.getAttribute("data-slot")).toBe("toolbar-button")
  toolbarButton.setAttribute("for", "missing")
  await wait()
  expect(button.hasAttribute("data-slot")).toBe(false)
})
