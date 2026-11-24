import "@ui-sdk/web/navigation-menu"
import { ChevronDown, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const gettingStarted = [
  {
    title: "Introduction",
    href: "#introduction",
    description: "Unstyled components with one core for every framework.",
  },
  {
    title: "Installation",
    href: "#installation",
    description:
      "Add the package for your framework and render your first part.",
  },
  {
    title: "Styling",
    href: "#styling",
    description: "Style parts with data attributes, CSS variables and any CSS.",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-navigation-menu aria-label="Docs">
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
                  <a href="${page.href}" data-router>
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
        <ui-navigation-menu-item>
          <ui-navigation-menu-link>
            <a href="#components" data-router>Components</a>
          </ui-navigation-menu-link>
        </ui-navigation-menu-item>
      </ui-navigation-menu-list>
      <ui-navigation-menu-viewport side-offset="8"></ui-navigation-menu-viewport>
    </ui-navigation-menu>
  `
  function setRoute(route: string) {
    for (const link of root.querySelectorAll("ui-navigation-menu-link")) {
      link.toggleAttribute(
        "current",
        link.querySelector("a")!.getAttribute("href") === route
      )
    }
  }
  for (const link of root.querySelectorAll<HTMLAnchorElement>(
    "a[data-router]"
  )) {
    link.addEventListener("click", (event) => {
      event.preventDefault()
      const href = link.getAttribute("href")!
      setRoute(href)
      log(root, `Navigated to ${href}`)
    })
  }
  setRoute("#introduction")
}

export { mount }
