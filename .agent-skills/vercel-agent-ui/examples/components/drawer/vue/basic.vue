<script setup lang="ts">
import { MinusIcon, PlusIcon } from "@lucide/vue"
import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/vue/drawer"
import { ref } from "vue"
const goal = { initial: 350, min: 200, max: 400, step: 10 }

const calories = ref(goal.initial)
</script>

<template>
  <Drawer>
    <DrawerTrigger>Open Drawer</DrawerTrigger>
    <DrawerBackdrop />
    <DrawerContent>
      <div data-slot="grip" aria-hidden="true" />

      <div data-slot="stack">
        <DrawerTitle>Move goal</DrawerTitle>
        <DrawerDescription>Set your daily activity goal.</DrawerDescription>
      </div>

      <div data-slot="row">
        <button
          type="button"
          aria-label="Decrease"
          :disabled="calories <= goal.min"
          @click="calories -= goal.step"
        >
          <MinusIcon aria-hidden="true" />
        </button>
        <div data-slot="stack">
          <div aria-live="polite">{{ calories }}</div>
          <div data-slot="hint">Calories/day</div>
        </div>
        <button
          type="button"
          aria-label="Increase"
          :disabled="calories >= goal.max"
          @click="calories += goal.step"
        >
          <PlusIcon aria-hidden="true" />
        </button>
      </div>

      <div data-slot="stack">
        <DrawerClose data-variant="solid" value="submit">Submit</DrawerClose>
        <DrawerClose>Cancel</DrawerClose>
      </div>
    </DrawerContent>
  </Drawer>
</template>
