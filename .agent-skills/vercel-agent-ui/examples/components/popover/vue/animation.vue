<script setup lang="ts">
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/vue/popover"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Popover
    @open-change="(open: boolean) => log(open ? 'Opening' : 'Closing')"
    @open-change-complete="(open: boolean) => log(open ? 'Open' : 'Closed')"
  >
    <PopoverTrigger>What's New</PopoverTrigger>
    <PopoverContent keep-mounted>
      <PopoverTitle>What's new</PopoverTitle>
      <PopoverDescription
        >Comments now support threads and reactions.</PopoverDescription
      >
      <div data-slot="row">
        <PopoverClose data-variant="solid">Got It</PopoverClose>
      </div>
    </PopoverContent>
  </Popover>
</template>
