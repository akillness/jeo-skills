<script setup lang="ts">
import {
  CheckIcon,
  ChevronsUpDownIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@lucide/vue"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import { Toolbar, ToolbarButton } from "@ui-sdk/vue/toolbar"
import { computed, ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const zooms = ["50%", "75%", "100%", "150%", "200%"]

const log = useLog()
const zoom = ref("100%")
const index = computed(() => zooms.indexOf(zoom.value))

function change(value: string) {
  zoom.value = value
  log(`Zoom ${value}`)
}
</script>

<template>
  <Toolbar aria-label="View">
    <ToolbarButton
      aria-label="Zoom out"
      :disabled="index === 0"
      @click="change(zooms[index - 1])"
    >
      <ZoomOutIcon aria-hidden="true" />
    </ToolbarButton>
    <Select :value="zoom" @value-change="(value) => value && change(value)">
      <ToolbarButton aria-label="Zoom">
        <template #render="{ props }">
          <SelectTrigger v-bind="props">
            <SelectValue />
            <ChevronsUpDownIcon aria-hidden="true" />
          </SelectTrigger>
        </template>
      </ToolbarButton>
      <SelectContent>
        <SelectItem v-for="zoom in zooms" :key="zoom" :value="zoom">
          {{ zoom }}
          <SelectItemIndicator>
            <CheckIcon aria-hidden="true" />
          </SelectItemIndicator>
        </SelectItem>
      </SelectContent>
    </Select>
    <ToolbarButton
      aria-label="Zoom in"
      :disabled="index === zooms.length - 1"
      @click="change(zooms[index + 1])"
    >
      <ZoomInIcon aria-hidden="true" />
    </ToolbarButton>
  </Toolbar>
</template>
