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

  let {
    defaultValue,
    keepMounted,
  }: { defaultValue?: string; keepMounted?: boolean } = $props()
</script>

<NavigationMenu aria-label="Main" {defaultValue}>
  <NavigationMenuList>
    <NavigationMenuItem value="products">
      <NavigationMenuTrigger>Products</NavigationMenuTrigger>
      <NavigationMenuContent {keepMounted}>
        <NavigationMenuLink href="/analytics">Analytics</NavigationMenuLink>
      </NavigationMenuContent>
    </NavigationMenuItem>
    <NavigationMenuItem>
      <NavigationMenuLink href="/pricing" current>Pricing</NavigationMenuLink>
    </NavigationMenuItem>
  </NavigationMenuList>
  <NavigationMenuViewport />
</NavigationMenu>
