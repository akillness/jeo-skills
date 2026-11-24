<script lang="ts">
  import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
    NavigationMenuViewport,
  } from "../../src/navigation-menu"

  let { viewport }: { viewport: boolean } = $props()
  let value = $state<string | null>(null)

  export function set(next: string | null) {
    value = next
  }
</script>

<NavigationMenu aria-label="Main" bind:value>
  <NavigationMenuList>
    {#each ["a", "b"] as item (item)}
      <NavigationMenuItem value={item}>
        <NavigationMenuTrigger>{item}</NavigationMenuTrigger>
        <NavigationMenuContent
          ><NavigationMenuLink href="#{item}">Link</NavigationMenuLink
          ></NavigationMenuContent
        >
      </NavigationMenuItem>
    {/each}
  </NavigationMenuList>
  {#if viewport}
    <NavigationMenuViewport />
  {/if}
</NavigationMenu>
