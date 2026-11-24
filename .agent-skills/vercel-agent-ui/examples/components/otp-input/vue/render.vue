<script setup lang="ts">
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/vue/otp-input"
</script>

<template>
  <OTPInput v-slot="{ state }" :max-length="5" aria-label="Invite code">
    <OTPInputGroup>
      <OTPInputSlot
        v-for="(_, index) in state.slots"
        :key="index"
        :index="index"
      >
        <template #render="{ props, state: slot }">
          <span v-bind="props">
            <template v-if="slot.char">{{ slot.char }}</template>
            <span v-else-if="slot.hasFakeCaret" />
          </span>
        </template>
      </OTPInputSlot>
    </OTPInputGroup>
  </OTPInput>
</template>
