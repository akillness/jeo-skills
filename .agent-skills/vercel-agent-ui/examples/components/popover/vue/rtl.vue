<script setup lang="ts">
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/vue/popover"
</script>

<template>
  <div dir="rtl">
    <Popover>
      <PopoverTrigger>الأبعاد</PopoverTrigger>
      <PopoverContent align="start" :side-offset="8">
        <PopoverArrow />
        <PopoverTitle>الأبعاد</PopoverTitle>
        <PopoverDescription>اضبط أبعاد الطبقة.</PopoverDescription>
      </PopoverContent>
    </Popover>
  </div>
</template>
