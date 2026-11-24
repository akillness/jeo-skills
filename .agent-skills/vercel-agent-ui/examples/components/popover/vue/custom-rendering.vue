<script setup lang="ts">
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverShortcut,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/vue/popover"
</script>

<template>
  <Popover>
    <PopoverTrigger shortcut="mod+u">
      <template #render="{ props, state }">
        <button v-bind="props">
          {{ state.open ? "Hide Updates" : "Show Updates" }}
          <PopoverShortcut v-slot="{ state: shortcut }">{{
            shortcut.text
          }}</PopoverShortcut>
        </button>
      </template>
    </PopoverTrigger>
    <PopoverContent>
      <PopoverTitle>
        <template #render="{ props }">
          <h3 v-bind="props">Updates</h3>
        </template>
      </PopoverTitle>
      <PopoverDescription
        >Version 2.4 adds threaded comments.</PopoverDescription
      >
      <PopoverClose>
        <template #render="{ props }">
          <a v-bind="props" href="#">Read the Changelog</a>
        </template>
      </PopoverClose>
    </PopoverContent>
  </Popover>
</template>
