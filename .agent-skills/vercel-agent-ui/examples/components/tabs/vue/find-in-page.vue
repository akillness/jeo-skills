<script setup lang="ts">
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/vue/tabs"

const policies = [
  {
    value: "shipping",
    label: "Shipping",
    text: "Orders leave our warehouse within two working days. Express delivery arrives the next morning.",
  },
  {
    value: "returns",
    label: "Returns",
    text: "Send anything back within 30 days. Opened electronics carry a restocking fee of 10 percent.",
  },
  {
    value: "warranty",
    label: "Warranty",
    text: "Every product has a two-year warranty. Batteries are covered for one year from delivery.",
  },
]
</script>

<template>
  <Tabs default-value="shipping" hidden-until-found>
    <TabsList aria-label="Policies">
      <TabsTab
        v-for="policy in policies"
        :key="policy.value"
        :value="policy.value"
      >
        {{ policy.label }}
      </TabsTab>
    </TabsList>
    <TabsPanel
      v-for="policy in policies"
      :key="policy.value"
      :value="policy.value"
    >
      {{ policy.text }}
    </TabsPanel>
  </Tabs>
</template>
