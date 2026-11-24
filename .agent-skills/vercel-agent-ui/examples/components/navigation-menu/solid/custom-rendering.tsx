import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@ui-sdk/solid/navigation-menu"
import { For } from "solid-js"

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

function Example() {
  return (
    <NavigationMenu aria-label="Main">
      <NavigationMenuList>
        <For each={sections}>
          {(section) => (
            <NavigationMenuItem value={section.value}>
              <NavigationMenuTrigger
                render={(props, state) => (
                  <button {...props}>
                    {section.label}
                    {state.open ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12h14" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12h14" />
                        <path d="M12 5v14" />
                      </svg>
                    )}
                  </button>
                )}
              />
              <NavigationMenuContent
                render={(props) => (
                  <section {...props} aria-label={section.label} />
                )}
              >
                {(state) => (
                  <>
                    <p data-slot="hint">
                      {state.motion ? `Moved in ${state.motion}` : "Opened"}
                    </p>
                    <ul>
                      <For each={section.links}>
                        {(link, index) => (
                          <li>
                            <NavigationMenuLink
                              href={link.href}
                              current={index() === 0}
                              render={(props, linkState) => (
                                <a {...props}>
                                  <span>{link.title}</span>
                                  {linkState.current && (
                                    <span data-slot="hint" data-show="current">
                                      You're here
                                    </span>
                                  )}
                                </a>
                              )}
                            />
                          </li>
                        )}
                      </For>
                    </ul>
                  </>
                )}
              </NavigationMenuContent>
            </NavigationMenuItem>
          )}
        </For>
        <NavigationMenuItem value="pricing">
          <NavigationMenuTrigger
            disabled
            render={(props, state) => (
              <button {...props}>
                Pricing
                {state.disabled && (
                  <span data-slot="badge" data-show="disabled">
                    Soon
                  </span>
                )}
              </button>
            )}
          />
          <NavigationMenuContent>Plans for teams.</NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
      <NavigationMenuViewport sideOffset={8} />
    </NavigationMenu>
  )
}

export { Example }
