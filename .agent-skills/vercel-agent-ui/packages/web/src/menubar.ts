import { menubar, type MenubarApi } from "@ui-sdk/core/menubar"
import { createParts, instanceOf } from "./define-element"

// <ui-menubar> holds menus, each a <ui-menu> with its trigger and content.
// Define it before the menus, so they find it as they upgrade. Markup:
//
// <ui-menubar aria-label="Editor">
//   <ui-menu>
//     <ui-menu-trigger><button>File</button></ui-menu-trigger>
//     <ui-menu-content>…</ui-menu-content>
//   </ui-menu>
// </ui-menubar>
function defineMenubarElements() {
  createParts(menubar, {
    root: {
      tag: "ui-menubar",
      display: "block",
      defaults: { loop: true },
      api: ["focus", "isOpen", "close"],
      // Menus that upgraded first, like when the menubar loads later, bound as
      // menus of their own. They join it now.
      render(el, { api }) {
        for (const menu of el.querySelectorAll<
          HTMLElement & { rebind?: () => void }
        >("ui-menu")) {
          if (instanceOf(menu) && menubarOf(menu) === api) {
            menu.rebind?.()
          }
        }
      },
    },
  })
}

// The menubar a menu sits in, unless it sits inside another menu first.
function menubarOf(el: HTMLElement) {
  const found = el.parentElement?.closest("ui-menubar, ui-menu")
  return found?.localName === "ui-menubar"
    ? instanceOf<MenubarApi>(found)?.api
    : undefined
}

export { defineMenubarElements, menubarOf }
