<script lang="ts">
  import { MinusIcon, PlusIcon } from "@lucide/svelte"
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

<NavigationMenu aria-label="Main">
  <NavigationMenuList>
    {#each sections as section (section.value)}
      <NavigationMenuItem value={section.value}>
        <NavigationMenuTrigger>
          {#snippet render({ props, state })}
            <button {...props}>
              {section.label}
              {#if state.open}
                <MinusIcon />
              {:else}
                <PlusIcon />
              {/if}
            </button>
          {/snippet}
        </NavigationMenuTrigger>
        <NavigationMenuContent aria-label={section.label}>
          {#snippet render({ props, state })}
            <section {...props}>
              <p data-slot="hint">
                {state.motion ? `Moved in ${state.motion}` : "Opened"}
              </p>
              <ul>
                {#each section.links as link, index (link.title)}
                  <li>
                    <NavigationMenuLink href={link.href} current={index === 0}>
                      {#snippet children(linkState)}
                        <span>{link.title}</span>
                        {#if linkState.current}
                          <span data-slot="hint" data-show="current"
                            >You're here</span
                          >
                        {/if}
                      {/snippet}
                    </NavigationMenuLink>
                  </li>
                {/each}
              </ul>
            </section>
          {/snippet}
        </NavigationMenuContent>
      </NavigationMenuItem>
    {/each}
    <NavigationMenuItem value="pricing">
      <NavigationMenuTrigger disabled>
        {#snippet render({ props, state })}
          <button {...props}>
            Pricing
            {#if state.disabled}
              <span data-slot="badge" data-show="disabled">Soon</span>
            {/if}
          </button>
        {/snippet}
      </NavigationMenuTrigger>
      <NavigationMenuContent>Plans for teams.</NavigationMenuContent>
    </NavigationMenuItem>
  </NavigationMenuList>
  <NavigationMenuViewport sideOffset={8} />
</NavigationMenu>
