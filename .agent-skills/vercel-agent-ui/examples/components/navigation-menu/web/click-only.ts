import "@ui-sdk/web/navigation-menu"
import { ChevronDown, createElement } from "lucide"

const sections = [
  {
    value: "guides",
    label: "Guides",
    links: [
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
        description:
          "Style parts with data attributes, CSS variables and any CSS.",
      },
    ],
  },
  {
    value: "components",
    label: "Components",
    links: [
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
    ],
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-navigation-menu aria-label="Main" open-on-hover="false">
      <ui-navigation-menu-list>
        ${sections
          .map(
            (section) => `
        <ui-navigation-menu-item value="${section.value}">
          <ui-navigation-menu-trigger>
            <button>
              ${section.label}
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-navigation-menu-trigger>
          <ui-navigation-menu-content>
            <ul>
              ${section.links
                .map(
                  (link) => `
              <li>
                <ui-navigation-menu-link>
                  <a href="${link.href}">
                    <span>${link.title}</span>
                    <span data-slot="hint">${link.description}</span>
                  </a>
                </ui-navigation-menu-link>
              </li>`
                )
                .join("")}
            </ul>
          </ui-navigation-menu-content>
        </ui-navigation-menu-item>`
          )
          .join("")}
      </ui-navigation-menu-list>
      <ui-navigation-menu-viewport side-offset="8"></ui-navigation-menu-viewport>
    </ui-navigation-menu>
  `
}

export { mount }
