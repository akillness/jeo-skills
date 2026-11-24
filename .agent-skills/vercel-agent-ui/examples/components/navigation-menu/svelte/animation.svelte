<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
    NavigationMenuViewport,
  } from "@ui-sdk/svelte/navigation-menu"
  import { useLog } from "../../../shared/svelte/log"

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
      description:
        "Style parts with data attributes, CSS variables and any CSS.",
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

  const log = useLog()
</script>

<NavigationMenu
  aria-label="Main"
  onValueChange={(value) => log(value ? `Showing ${value}` : "Closing")}
  onOpenChangeComplete={(open) =>
    log(open ? "Finished opening" : "Finished closing")}
>
  <NavigationMenuList>
    <NavigationMenuItem value="guides">
      <NavigationMenuTrigger>
        Guides
        <ChevronDownIcon />
      </NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul>
          {#each gettingStarted as page (page.title)}
            <li>
              <NavigationMenuLink href={page.href}>
                <span>{page.title}</span>
                <span data-slot="hint">{page.description}</span>
              </NavigationMenuLink>
            </li>
          {/each}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
    <NavigationMenuItem value="components">
      <NavigationMenuTrigger>
        Components
        <ChevronDownIcon />
      </NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul data-slot="grid">
          {#each components as page (page.title)}
            <li>
              <NavigationMenuLink href={page.href}>
                <span>{page.title}</span>
                <span data-slot="hint">{page.description}</span>
              </NavigationMenuLink>
            </li>
          {/each}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  </NavigationMenuList>
  <NavigationMenuViewport sideOffset={8} data-variant="slide" />
</NavigationMenu>
