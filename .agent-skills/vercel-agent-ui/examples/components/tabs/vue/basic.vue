<script setup lang="ts">
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/vue/tabs"
</script>

<template>
  <Tabs default-value="account">
    <TabsList aria-label="Settings">
      <TabsTab value="account">Account</TabsTab>
      <TabsTab value="password">Password</TabsTab>
    </TabsList>
    <TabsPanel value="account">
      Update your name, email address and profile photo. Your team sees changes
      right away.
    </TabsPanel>
    <TabsPanel value="password">
      Choose a new password for hollis@example.com. You stay signed in on this
      device.
    </TabsPanel>
  </Tabs>
</template>
