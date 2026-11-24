"use client"

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@ui-sdk/react/navigation-menu"
import { MinusIcon, PlusIcon } from "lucide-react"

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
        {sections.map((section) => (
          <NavigationMenuItem key={section.value} value={section.value}>
            <NavigationMenuTrigger
              render={(props, state) => (
                <button {...props}>
                  {section.label}
                  {state.open ? <MinusIcon /> : <PlusIcon />}
                </button>
              )}
            />
            <NavigationMenuContent
              render={<section aria-label={section.label} />}
            >
              {(state) => (
                <>
                  <p data-slot="hint">
                    {state.motion ? `Moved in ${state.motion}` : "Opened"}
                  </p>
                  <ul>
                    {section.links.map((link, index) => (
                      <li key={link.title}>
                        <NavigationMenuLink
                          href={link.href}
                          current={index === 0}
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
                    ))}
                  </ul>
                </>
              )}
            </NavigationMenuContent>
          </NavigationMenuItem>
        ))}
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
