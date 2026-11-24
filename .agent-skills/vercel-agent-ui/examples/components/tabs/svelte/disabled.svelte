<script lang="ts">
  import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/svelte/tabs"
</script>

<Tabs defaultValue="overview">
  <TabsList aria-label="Dashboard">
    <TabsTab value="overview">Overview</TabsTab>
    <TabsTab value="analytics">Analytics</TabsTab>
    <TabsTab value="reports" disabled>Reports</TabsTab>
  </TabsList>
  <TabsPanel value="overview"
    >Revenue, visitors and sign-ups for the last 30 days.</TabsPanel
  >
  <TabsPanel value="analytics"
    >Where your visitors come from and the pages they read most.</TabsPanel
  >
  <TabsPanel value="reports"
    >Monthly reports are available on the Pro plan.</TabsPanel
  >
</Tabs>
