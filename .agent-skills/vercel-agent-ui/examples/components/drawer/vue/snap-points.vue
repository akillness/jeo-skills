<script setup lang="ts">
import {
  Drawer,
  DrawerBackdrop,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/vue/drawer"

const places = [
  { name: "Blue Bottle Coffee", detail: "Coffee · 0.2 mi" },
  { name: "Tartine Bakery", detail: "Bakery · 0.4 mi" },
  { name: "Dolores Park", detail: "Park · 0.5 mi" },
  { name: "Mission Dolores", detail: "Landmark · 0.6 mi" },
  { name: "Ritual Coffee Roasters", detail: "Coffee · 0.7 mi" },
  { name: "Bi-Rite Creamery", detail: "Ice cream · 0.7 mi" },
  { name: "Alamo Square", detail: "Park · 1.1 mi" },
  { name: "The Castro Theatre", detail: "Cinema · 1.2 mi" },
  { name: "Ferry Building", detail: "Market · 2.3 mi" },
  { name: "Coit Tower", detail: "Landmark · 2.9 mi" },
  { name: "Golden Gate Park", detail: "Park · 3.0 mi" },
  { name: "Lands End", detail: "Trail · 5.4 mi" },
]
</script>

<template>
  <Drawer
    :snap-points="[0.25, 0.5, 1]"
    :default-snap-point="0.5"
    expand-on-scroll
  >
    <DrawerTrigger>Find a Place</DrawerTrigger>
    <DrawerBackdrop />
    <DrawerContent>
      <DrawerHandle aria-label="Resize" />
      <div data-slot="stack">
        <DrawerTitle>Places nearby</DrawerTitle>
        <DrawerDescription
          >Drag the drawer, or press the handle, to see more.</DrawerDescription
        >
      </div>
      <div data-slot="scroll">
        <ul data-slot="list">
          <li v-for="place in places" :key="place.name">
            <div>{{ place.name }}</div>
            <div data-slot="hint">{{ place.detail }}</div>
          </li>
        </ul>
      </div>
    </DrawerContent>
  </Drawer>
</template>
