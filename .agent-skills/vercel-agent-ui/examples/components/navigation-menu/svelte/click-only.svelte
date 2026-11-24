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
</script>

<NavigationMenu aria-label="Main" openOnHover={false}>
  <NavigationMenuList>
    {#each sections as section (section.value)}
      <NavigationMenuItem value={section.value}>
        <NavigationMenuTrigger>
          {section.label}
          <ChevronDownIcon />
        </NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul>
            {#each section.links as link (link.title)}
              <li>
                <NavigationMenuLink href={link.href}>
                  <span>{link.title}</span>
                  <span data-slot="hint">{link.description}</span>
                </NavigationMenuLink>
              </li>
            {/each}
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
    {/each}
  </NavigationMenuList>
  <NavigationMenuViewport sideOffset={8} />
</NavigationMenu>
