<script lang="ts">
  import {
    ArrowRightIcon,
    ChevronDownIcon,
    CircleIcon,
    CircleCheckIcon,
    CircleQuestionMarkIcon,
  } from "@lucide/svelte"
  import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuLinkIcon,
    NavigationMenuList,
    NavigationMenuTrigger,
    NavigationMenuViewport,
  } from "@ui-sdk/svelte/navigation-menu"

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

  const statuses = [
    { title: "Backlog", href: "#", icon: CircleQuestionMarkIcon },
    { title: "To do", href: "#", icon: CircleIcon },
    { title: "Done", href: "#", icon: CircleCheckIcon },
    { title: "All issues", href: "#", icon: ArrowRightIcon, mirror: true },
  ]
</script>

<NavigationMenu aria-label="Main">
  <NavigationMenuList>
    <NavigationMenuItem value="getting-started">
      <NavigationMenuTrigger>
        Getting started
        <ChevronDownIcon />
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
    <NavigationMenuItem value="with-icon">
      <NavigationMenuTrigger>
        With Icon
        <ChevronDownIcon />
      </NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul>
          {#each statuses as status (status.title)}
            <li>
              <NavigationMenuLink href={status.href}>
                <NavigationMenuLinkIcon mirror={status.mirror}>
                  <status.icon />
                </NavigationMenuLinkIcon>
                {status.title}
              </NavigationMenuLink>
            </li>
          {/each}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
    <NavigationMenuItem>
      <NavigationMenuLink href="#">Docs</NavigationMenuLink>
    </NavigationMenuItem>
  </NavigationMenuList>
  <NavigationMenuViewport sideOffset={8} />
</NavigationMenu>
