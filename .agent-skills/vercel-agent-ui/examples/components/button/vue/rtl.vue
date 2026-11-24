<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue"
import { Button } from "@ui-sdk/vue/button"
</script>

<template>
  <div data-slot="row" dir="rtl">
    <Button>
      متابعة
      <ChevronRightIcon />
    </Button>
    <Button>إلغاء</Button>
  </div>
</template>
