import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuLinkIcon,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@ui-sdk/solid/navigation-menu"
import type { JSX } from "@solidjs/web"
import { For } from "solid-js"

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

const icon = (children: JSX.Element) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)
const CircleQuestionMark = () =>
  icon(
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </>
  )
const Circle = () => icon(<circle cx="12" cy="12" r="10" />)
const CircleCheck = () =>
  icon(
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m16 9-5.5 5.5L8 12" />
    </>
  )
const ArrowRight = () =>
  icon(
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  )

const statuses = [
  { title: "Backlog", href: "#", icon: CircleQuestionMark },
  { title: "To do", href: "#", icon: Circle },
  { title: "Done", href: "#", icon: CircleCheck },
  { title: "All issues", href: "#", icon: ArrowRight, mirror: true },
]

function Example() {
  return (
    <NavigationMenu aria-label="Main">
      <NavigationMenuList>
        <NavigationMenuItem value="getting-started">
          <NavigationMenuTrigger>
            Getting started
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul data-slot="grid">
              <li>
                <NavigationMenuLink href="#" data-variant="featured">
                  <span>ui-sdk</span>
                  <span data-slot="hint">
                    Accessible components for React, Vue, Svelte, Solid and Web
                    Components.
                  </span>
                </NavigationMenuLink>
              </li>
              <For each={gettingStarted}>
                {(page) => (
                  <li>
                    <NavigationMenuLink href={page.href}>
                      <span>{page.title}</span>
                      <span data-slot="hint">{page.description}</span>
                    </NavigationMenuLink>
                  </li>
                )}
              </For>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem value="components">
          <NavigationMenuTrigger>
            Components
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul data-slot="grid">
              <For each={components}>
                {(page) => (
                  <li>
                    <NavigationMenuLink href={page.href}>
                      <span>{page.title}</span>
                      <span data-slot="hint">{page.description}</span>
                    </NavigationMenuLink>
                  </li>
                )}
              </For>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem value="with-icon">
          <NavigationMenuTrigger>
            With Icon
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul>
              <For each={statuses}>
                {(status) => (
                  <li>
                    <NavigationMenuLink href={status.href}>
                      <NavigationMenuLinkIcon mirror={status.mirror}>
                        <status.icon />
                      </NavigationMenuLinkIcon>
                      {status.title}
                    </NavigationMenuLink>
                  </li>
                )}
              </For>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="#">Docs</NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
      <NavigationMenuViewport sideOffset={8} />
    </NavigationMenu>
  )
}

export { Example }
