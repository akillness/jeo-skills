<script setup lang="ts">
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/vue/tabs"
</script>

<template>
  <Tabs default-value="general" orientation="vertical">
    <TabsList aria-label="Preferences">
      <TabsTab value="general">General</TabsTab>
      <TabsTab value="security">Security</TabsTab>
      <TabsTab value="integrations">Integrations</TabsTab>
    </TabsList>
    <TabsPanel value="general"
      >Choose your language, time zone and the page you start on.</TabsPanel
    >
    <TabsPanel value="security"
      >Manage passkeys, signed-in sessions and recovery codes.</TabsPanel
    >
    <TabsPanel value="integrations"
      >Connect your calendar and chat apps to get reminders.</TabsPanel
    >
  </Tabs>
</template>
