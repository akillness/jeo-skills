import "@ui-sdk/web/navigation-menu"
import type { UiNavigationMenuElement } from "@ui-sdk/web"
import { ChevronDown, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const gettingStarted = [
  {
    title: "Introduction",
    href: "#",
    description: "Unstyled components with one core for every framework.",
  },
  {
    title: "Installation",
    href: "#",
    description:
      "Add the package for your framework and render your first part.",
  },
  {
    title: "Styling",
    href: "#",
    description: "Style parts with data attributes, CSS variables and any CSS.",
  },
]

const components = [
  {
    title: "Alert Dialog",
    href: "#",
    description:
      "Asks for a decision before anything else on the page can be used.",
  },
  {
    title: "Hover Card",
    href: "#",
    description:
      "A preview of what a link points to, for people who pause on it.",
  },
  {
    title: "Progress",
    href: "#",
    description: "Shows how far along a task is, like an upload.",
  },
  {
    title: "Scroll Area",
    href: "#",
    description: "Scrolls its content with scrollbars you can style.",
  },
  {
    title: "Tabs",
    href: "#",
    description:
      "Shows one panel of content at a time, picked from a list of tabs.",
  },
  {
    title: "Tooltip",
    href: "#",
    description:
      "A short label for a control, shown on hover or keyboard focus.",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-navigation-menu aria-label="Main">
      <ui-navigation-menu-list>
        <ui-navigation-menu-item value="guides">
          <ui-navigation-menu-trigger>
            <button>
              Guides
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-navigation-menu-trigger>
          <ui-navigation-menu-content>
            <ul>
              ${gettingStarted
                .map(
                  (page) => `
              <li>
                <ui-navigation-menu-link>
                  <a href="${page.href}">
                    <span>${page.title}</span>
                    <span data-slot="hint">${page.description}</span>
                  </a>
                </ui-navigation-menu-link>
              </li>`
                )
                .join("")}
            </ul>
          </ui-navigation-menu-content>
        </ui-navigation-menu-item>
        <ui-navigation-menu-item value="components">
          <ui-navigation-menu-trigger>
            <button>
              Components
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-navigation-menu-trigger>
          <ui-navigation-menu-content>
            <ul data-slot="grid">
              ${components
                .map(
                  (page) => `
              <li>
                <ui-navigation-menu-link>
                  <a href="${page.href}">
                    <span>${page.title}</span>
                    <span data-slot="hint">${page.description}</span>
                  </a>
                </ui-navigation-menu-link>
              </li>`
                )
                .join("")}
            </ul>
          </ui-navigation-menu-content>
        </ui-navigation-menu-item>
      </ui-navigation-menu-list>
      <ui-navigation-menu-viewport side-offset="8" data-variant="slide"></ui-navigation-menu-viewport>
    </ui-navigation-menu>
  `
  const menu =
    root.querySelector<UiNavigationMenuElement>("ui-navigation-menu")!
  menu.addEventListener("valuechange", (event) => {
    log(root, event.detail.value ? `Showing ${event.detail.value}` : "Closing")
  })
  menu.addEventListener("openchangecomplete", (event) => {
    log(root, event.detail.value ? "Finished opening" : "Finished closing")
  })
}

export { mount }
