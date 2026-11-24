<script setup lang="ts">
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/vue/popover"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Popover open-on-hover :delay="200" :close-delay="150">
    <PopoverTrigger>@kofi</PopoverTrigger>
    <PopoverContent :side-offset="8">
      <PopoverArrow />
      <PopoverTitle>Kofi Mensah</PopoverTitle>
      <PopoverDescription
        >Engineering manager, platform team.</PopoverDescription
      >
      <div data-slot="row">
        <button
          type="button"
          data-size="sm"
          data-variant="solid"
          @click="log('Followed @kofi')"
        >
          Follow
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
