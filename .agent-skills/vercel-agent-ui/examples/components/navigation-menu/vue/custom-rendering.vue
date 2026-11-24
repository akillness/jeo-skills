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
import { MinusIcon, PlusIcon } from "@lucide/vue"

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

<template>
  <NavigationMenu aria-label="Main">
    <NavigationMenuList>
      <NavigationMenuItem
        v-for="section in sections"
        :key="section.value"
        :value="section.value"
      >
        <NavigationMenuTrigger>
          <template #render="{ props, state }">
            <button v-bind="props">
              {{ section.label }}
              <MinusIcon v-if="state.open" />
              <PlusIcon v-else />
            </button>
          </template>
        </NavigationMenuTrigger>
        <NavigationMenuContent :aria-label="section.label">
          <template #render="{ props, state }">
            <section v-bind="props">
              <p data-slot="hint">
                {{ state.motion ? `Moved in ${state.motion}` : "Opened" }}
              </p>
              <ul>
                <li v-for="(link, index) in section.links" :key="link.title">
                  <NavigationMenuLink
                    v-slot="{ state: linkState }"
                    :href="link.href"
                    :current="index === 0"
                  >
                    <span>{{ link.title }}</span>
                    <span
                      v-if="linkState.current"
                      data-slot="hint"
                      data-show="current"
                      >You're here</span
                    >
                  </NavigationMenuLink>
                </li>
              </ul>
            </section>
          </template>
        </NavigationMenuContent>
      </NavigationMenuItem>
      <NavigationMenuItem value="pricing">
        <NavigationMenuTrigger disabled>
          <template #render="{ props, state }">
            <button v-bind="props">
              Pricing
              <span v-if="state.disabled" data-slot="badge" data-show="disabled"
                >Soon</span
              >
            </button>
          </template>
        </NavigationMenuTrigger>
        <NavigationMenuContent>Plans for teams.</NavigationMenuContent>
      </NavigationMenuItem>
    </NavigationMenuList>
    <NavigationMenuViewport :side-offset="8" />
  </NavigationMenu>
</template>
