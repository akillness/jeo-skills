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
import { ChevronDownIcon, ChevronRightIcon } from "@lucide/vue"

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

const groups = [
  {
    value: "overlays",
    label: "Overlays",
    links: [
      { title: "Dialog", href: "#" },
      { title: "Popover", href: "#" },
      { title: "Tooltip", href: "#" },
    ],
  },
  {
    value: "forms",
    label: "Forms",
    links: [
      { title: "Input", href: "#" },
      { title: "Select", href: "#" },
      { title: "Checkbox", href: "#" },
    ],
  },
]
</script>

<template>
  <NavigationMenu aria-label="Main">
    <NavigationMenuList>
      <NavigationMenuItem value="guides">
        <NavigationMenuTrigger>
          Guides
          <ChevronDownIcon />
        </NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul>
            <li v-for="link in gettingStarted" :key="link.title">
              <NavigationMenuLink :href="link.href">
                <span>{{ link.title }}</span>
                <span data-slot="hint">{{ link.description }}</span>
              </NavigationMenuLink>
            </li>
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
      <NavigationMenuItem value="components">
        <NavigationMenuTrigger>
          Components
          <ChevronDownIcon />
        </NavigationMenuTrigger>
        <NavigationMenuContent>
          <NavigationMenu orientation="vertical">
            <NavigationMenuList>
              <NavigationMenuItem
                v-for="group in groups"
                :key="group.value"
                :value="group.value"
              >
                <NavigationMenuTrigger>
                  {{ group.label }}
                  <ChevronRightIcon />
                </NavigationMenuTrigger>
                <NavigationMenuContent :side-offset="9" :align-offset="-5">
                  <ul>
                    <li v-for="link in group.links" :key="link.title">
                      <NavigationMenuLink :href="link.href">
                        {{ link.title }}
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </NavigationMenuContent>
      </NavigationMenuItem>
    </NavigationMenuList>
    <NavigationMenuViewport :side-offset="8" />
  </NavigationMenu>
</template>
