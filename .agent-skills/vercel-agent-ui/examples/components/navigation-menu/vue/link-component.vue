<script setup lang="ts">
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@ui-sdk/vue/navigation-menu"
import { defineComponent, h, ref } from "vue"
import { ChevronDownIcon } from "@lucide/vue"
import { useLog } from "../../../shared/vue/log"

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

const log = useLog()
const route = ref("#introduction")
const navigate = (href: string) => {
  route.value = href
  log(`Navigated to ${href}`)
}

const RouterLink = defineComponent({
  props: { to: { type: String, required: true } },
  setup(props, { slots, attrs }) {
    return () =>
      h(
        "a",
        {
          ...attrs,
          href: props.to,
          onClick(event: MouseEvent) {
            event.preventDefault()
            navigate(props.to)
          },
        },
        slots.default?.()
      )
  },
})
</script>

<template>
  <NavigationMenu aria-label="Docs">
    <NavigationMenuList>
      <NavigationMenuItem value="guides">
        <NavigationMenuTrigger>
          Guides
          <ChevronDownIcon />
        </NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul>
            <li v-for="page in gettingStarted" :key="page.title">
              <NavigationMenuLink :current="route === page.href">
                <template #render="{ props }">
                  <RouterLink v-bind="props" :to="page.href">
                    <span>{{ page.title }}</span>
                    <span data-slot="hint">{{ page.description }}</span>
                  </RouterLink>
                </template>
              </NavigationMenuLink>
            </li>
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink :current="route === '#components'">
          <template #render="{ props }">
            <RouterLink v-bind="props" to="#components">Components</RouterLink>
          </template>
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenuList>
    <NavigationMenuViewport :side-offset="8" />
  </NavigationMenu>
</template>
