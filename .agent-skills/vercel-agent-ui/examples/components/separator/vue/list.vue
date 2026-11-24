<script setup lang="ts">
import { Separator } from "@ui-sdk/vue/separator"
</script>

<template>
  <div data-slot="stack">
    <dl>
      <dt>Plan</dt>
      <dd>Pro</dd>
    </dl>
    <Separator />
    <dl>
      <dt>Seats</dt>
      <dd>8 of 10</dd>
    </dl>
    <Separator />
    <dl>
      <dt>Renews</dt>
      <dd>December 1, 2026</dd>
    </dl>
  </div>
</template>
