import "@ui-sdk/web/navigation-menu"
import {
  ArrowRight,
  ChevronDown,
  Circle,
  CircleCheck,
  CircleQuestionMark,
  createElement,
} from "lucide"

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

const statuses = [
  { title: "Backlog", href: "#", icon: CircleQuestionMark },
  { title: "To do", href: "#", icon: Circle },
  { title: "Done", href: "#", icon: CircleCheck },
  { title: "All issues", href: "#", icon: ArrowRight, mirror: true },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-navigation-menu aria-label="Main">
      <ui-navigation-menu-list>
        <ui-navigation-menu-item value="getting-started">
          <ui-navigation-menu-trigger>
            <button>
              Getting started
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-navigation-menu-trigger>
          <ui-navigation-menu-content>
            <ul data-slot="grid">
              <li>
                <ui-navigation-menu-link>
                  <a href="#" data-variant="featured">
                    <span>ui-sdk</span>
                    <span data-slot="hint">Accessible components for React, Vue, Svelte, Solid and Web Components.</span>
                  </a>
                </ui-navigation-menu-link>
              </li>
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
        <ui-navigation-menu-item value="with-icon">
          <ui-navigation-menu-trigger>
            <button>
              With Icon
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-navigation-menu-trigger>
          <ui-navigation-menu-content>
            <ul>
              ${statuses
                .map(
                  (status) => `
              <li>
                <ui-navigation-menu-link>
                  <a href="${status.href}">
                    <ui-navigation-menu-link-icon${status.mirror ? " mirror" : ""}>${createElement(status.icon, { "aria-hidden": "true" }).outerHTML}</ui-navigation-menu-link-icon>
                    ${status.title}
                  </a>
                </ui-navigation-menu-link>
              </li>`
                )
                .join("")}
            </ul>
          </ui-navigation-menu-content>
        </ui-navigation-menu-item>
        <ui-navigation-menu-item>
          <ui-navigation-menu-link>
            <a href="#">Docs</a>
          </ui-navigation-menu-link>
        </ui-navigation-menu-item>
      </ui-navigation-menu-list>
      <ui-navigation-menu-viewport side-offset="8"></ui-navigation-menu-viewport>
    </ui-navigation-menu>
  `
}

export { mount }
