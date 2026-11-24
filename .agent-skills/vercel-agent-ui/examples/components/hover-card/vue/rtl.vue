<script setup lang="ts">
import {
  HoverCard,
  HoverCardArrow,
  HoverCardContent,
  HoverCardTrigger,
} from "@ui-sdk/vue/hover-card"
</script>

<template>
  <div dir="rtl">
    <HoverCard>
      <HoverCardTrigger href="https://example.com/people/hollis"
        >هوليس غرانت</HoverCardTrigger
      >
      <HoverCardContent align="start" :side-offset="10">
        <HoverCardArrow />
        <p>هوليس غرانت</p>
        <p>مهندس تصميم في فريق المدفوعات.</p>
      </HoverCardContent>
    </HoverCard>
  </div>
</template>
