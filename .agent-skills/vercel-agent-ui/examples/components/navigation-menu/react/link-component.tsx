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
import { ChevronDownIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

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

function Link({
  href,
  onNavigate,
  ...props
}: React.ComponentProps<"a"> & {
  href: string
  onNavigate: (href: string) => void
}) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        props.onClick?.(event)
        event.preventDefault()
        onNavigate(href)
      }}
    />
  )
}

function Example() {
  const log = useLog()
  const [route, setRoute] = React.useState("#introduction")
  const navigate = (href: string) => {
    setRoute(href)
    log(`Navigated to ${href}`)
  }

  return (
    <NavigationMenu aria-label="Docs">
      <NavigationMenuList>
        <NavigationMenuItem value="guides">
          <NavigationMenuTrigger>
            Guides
            <ChevronDownIcon />
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul>
              {gettingStarted.map((page) => (
                <li key={page.title}>
                  <NavigationMenuLink
                    render={<Link href={page.href} onNavigate={navigate} />}
                    current={route === page.href}
                  >
                    <span>{page.title}</span>
                    <span data-slot="hint">{page.description}</span>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink
            render={<Link href="#components" onNavigate={navigate} />}
            current={route === "#components"}
          >
            Components
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
      <NavigationMenuViewport sideOffset={8} />
    </NavigationMenu>
  )
}

export { Example }
