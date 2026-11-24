<script setup lang="ts">
import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/vue/drawer"

const paragraphs = [
  "The drawer rises from any edge, rests on snap points and follows your finger with the same spring as a system sheet.",
  "Snap points take fractions of the screen, pixels, rem, percentages or the content's own size. Points that land within a pixel of each other merge into one.",
  "Dragging a list scrolls it until it reaches the top, and then the same gesture moves the drawer, so closing a long sheet never needs two tries.",
  "The handle steps through the snap points with a press, the arrow keys, Home and End. Screen readers on phones adjust it like a slider.",
  "Below a snap point you choose, the page behind stays usable and undimmed, like a map with a sheet of results.",
  "Drawers opened from inside each other stack, and the one beneath steps back while the new one rises.",
  "The on-screen keyboard pushes the drawer up, and the focused field scrolls into view inside it, never the page.",
  "With reduced motion, drawers fade in and out instead of sliding.",
]
</script>

<template>
  <Drawer>
    <DrawerTrigger>Scrollable Content</DrawerTrigger>
    <DrawerBackdrop />
    <DrawerContent initial-focus="content">
      <div data-slot="grip" aria-hidden="true" />
      <div data-slot="stack">
        <DrawerTitle>Release notes</DrawerTitle>
        <DrawerDescription>Everything new in the drawer.</DrawerDescription>
      </div>
      <div data-slot="scroll">
        <p
          data-slot="hint"
          v-for="(paragraph, index) in [...paragraphs, ...paragraphs]"
          :key="index"
        >
          {{ paragraph }}
        </p>
      </div>
      <div data-slot="stack">
        <DrawerClose data-variant="solid">Got It</DrawerClose>
      </div>
    </DrawerContent>
  </Drawer>
</template>
