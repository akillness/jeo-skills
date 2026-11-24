<script setup lang="ts">
import { MinusIcon, PlusIcon } from "@lucide/vue"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/vue/number-input"
import { Toolbar, ToolbarInput, ToolbarSeparator } from "@ui-sdk/vue/toolbar"
</script>

<template>
  <Toolbar aria-label="Text">
    <NumberInput :default-value="14" :min="8" :max="72">
      <NumberInputGroup>
        <NumberInputDecrement aria-label="Decrease font size">
          <MinusIcon aria-hidden="true" />
        </NumberInputDecrement>
        <ToolbarInput>
          <template #render="{ props }">
            <NumberInputControl v-bind="props" aria-label="Font size" />
          </template>
        </ToolbarInput>
        <NumberInputIncrement aria-label="Increase font size">
          <PlusIcon aria-hidden="true" />
        </NumberInputIncrement>
      </NumberInputGroup>
    </NumberInput>
    <ToolbarSeparator />
    <ToolbarInput aria-label="Find" placeholder="Find…" />
  </Toolbar>
</template>
